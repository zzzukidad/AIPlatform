'use strict';

/**
 * Image library: safe storage, sharp processing (WebP/AVIF/JPEG responsive
 * variants + smart-cropped thumbnail) and CRUD over the JSON store.
 *
 * Uploaded files are treated as untrusted: MIME is verified by decoding the
 * buffer with sharp (magic-byte validation), filenames are random hex, and
 * nothing is ever served from its original upload name.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { JsonStore } = require('./store');

const MEDIA_DIR = path.join(__dirname, '..', 'data', 'media');
const DEMO_DIR = path.join(__dirname, '..', 'demo-seed');
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

const SIZES = [480, 960, 1600, 2400]; // WebP responsive variants
const FALLBACK_SIZES = [960, 1600, 2400]; // JPEG fallbacks
const AVIF_SIZES = [960, 1600, 2400]; // AVIF variants

const TYPES = ['Plumbing', 'Gas', 'Repairs', 'Installation', 'General'];

// Optional starter photos shipped with the project (imported via admin).
const DEMO_MANIFEST = [
  { file: 'bathroom-renovation.jpg', name: 'Bathroom Renovation', type: 'Plumbing', cta: 'Contact Us' },
  { file: 'gas-fitting.jpg', name: 'Gas Fitting', type: 'Gas', cta: 'Contact Us' },
  { file: 'pipe-repairs.jpg', name: 'Pipe Repairs', type: 'Repairs', cta: 'Contact Us' },
  { file: 'hot-water-install.jpg', name: 'Hot Water Installation', type: 'Installation', cta: 'Contact Us' },
];

const store = new JsonStore('images.json', () => ({ images: [] }));
fs.mkdirSync(MEDIA_DIR, { recursive: true });

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function list() {
  return store.data.images;
}

function get(id) {
  return store.data.images.find((img) => img.id === id) || null;
}

/** Decode + validate an untrusted upload buffer. Returns sharp metadata. */
async function validateBuffer(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch (err) {
    throw new Error('not-a-valid-image');
  }
  if (!meta || !['jpeg', 'png', 'webp'].includes(meta.format)) {
    throw new Error('unsupported-format');
  }
  if (!meta.width || !meta.height) throw new Error('not-a-valid-image');
  return meta;
}

/**
 * Generate the variant set for an image buffer.
 * Files are named `<id>-w<width>.webp`, `-f<width>.jpg`, `-a<width>.avif`,
 * plus a 640x420 smart-cropped `-thumb.webp` (sharp 'attention' strategy).
 */
async function writeVariants(id, buffer) {
  const variants = {};
  let base = null;

  for (const width of SIZES) {
    const file = `${id}-w${width}.webp`;
    const info = await sharp(buffer)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toFile(path.join(MEDIA_DIR, file));
    variants[`w${width}`] = file;
    if (width === 1600) base = info;
  }
  for (const width of FALLBACK_SIZES) {
    const file = `${id}-f${width}.jpg`;
    await sharp(buffer)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(path.join(MEDIA_DIR, file));
    variants[`f${width}`] = file;
  }
  for (const width of AVIF_SIZES) {
    const file = `${id}-a${width}.avif`;
    try {
      await sharp(buffer)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .avif({ quality: 58, effort: 4 })
        .toFile(path.join(MEDIA_DIR, file));
      variants[`a${width}`] = file;
    } catch (err) {
      // AVIF support is optional — WebP/JPEG set is fully functional without it.
    }
  }

  const thumb = `${id}-thumb.webp`;
  await sharp(buffer)
    .rotate()
    .resize(640, 420, { fit: 'cover', position: 'attention' })
    .webp({ quality: 78, effort: 4 })
    .toFile(path.join(MEDIA_DIR, thumb));

  return { variants, thumb, width: base ? base.width : 1600, height: base ? base.height : 900 };
}

function deleteFiles(variants, thumb) {
  const files = [...Object.values(variants || {}), thumb].filter(Boolean);
  for (const file of files) {
    try {
      fs.unlinkSync(path.join(MEDIA_DIR, file));
    } catch (err) {
      /* already gone */
    }
  }
}

function normaliseMeta(input) {
  const name = String(input.name || '').trim().slice(0, 90);
  const type = TYPES.includes(input.type) ? input.type : 'General';
  const cta = String(input.cta || '').trim().slice(0, 40);
  return { name, type, cta };
}

async function addImage(metaInput, buffer) {
  await validateBuffer(buffer);
  const id = newId();
  const { variants, thumb, width, height } = await writeVariants(id, buffer);
  const record = {
    id,
    ...normaliseMeta(metaInput),
    variants,
    thumb,
    width,
    height,
    createdAt: new Date().toISOString(),
  };
  await store.mutate((d) => {
    d.images.push(record);
  });
  return record;
}

async function replacePhoto(id, buffer) {
  const existing = get(id);
  if (!existing) throw new Error('not-found');
  await validateBuffer(buffer);
  const suffix = crypto.randomBytes(4).toString('hex');
  const { variants, thumb, width, height } = await writeVariants(`${id}${suffix}`, buffer);
  const oldVariants = existing.variants;
  const oldThumb = existing.thumb;
  await store.mutate((d) => {
    const record = d.images.find((img) => img.id === id);
    if (!record) return;
    record.variants = variants;
    record.thumb = thumb;
    record.width = width;
    record.height = height;
  });
  deleteFiles(oldVariants, oldThumb);
}

async function updateImage(id, metaInput) {
  const meta = normaliseMeta(metaInput);
  await store.mutate((d) => {
    const record = d.images.find((img) => img.id === id);
    if (!record) return;
    record.name = meta.name;
    record.type = meta.type;
    record.cta = meta.cta;
  });
  return get(id);
}

async function deleteImage(id) {
  const existing = get(id);
  if (!existing) return false;
  await store.mutate((d) => {
    d.images = d.images.filter((img) => img.id !== id);
  });
  deleteFiles(existing.variants, existing.thumb);
  return true;
}

async function seedDemoImages() {
  const imported = [];
  for (const item of DEMO_MANIFEST) {
    const filePath = path.join(DEMO_DIR, item.file);
    if (!fs.existsSync(filePath)) continue;
    const buffer = fs.readFileSync(filePath);
    const record = await addImage({ name: item.name, type: item.type, cta: item.cta }, buffer);
    imported.push(record);
  }
  return imported;
}

function demoAvailable() {
  return DEMO_MANIFEST.some((item) => fs.existsSync(path.join(DEMO_DIR, item.file)));
}

/* ---------------- view helpers ---------------- */

function mediaUrl(file) {
  return `/media/${file}`;
}

function webpSrcset(image) {
  return SIZES.filter((s) => image.variants[`w${s}`])
    .map((s) => `${mediaUrl(image.variants[`w${s}`])} ${s}w`)
    .join(', ');
}

function avifSrcset(image) {
  return AVIF_SIZES.filter((s) => image.variants[`a${s}`])
    .map((s) => `${mediaUrl(image.variants[`a${s}`])} ${s}w`)
    .join(', ');
}

function jpgSrcset(image) {
  return FALLBACK_SIZES.filter((s) => image.variants[`f${s}`])
    .map((s) => `${mediaUrl(image.variants[`f${s}`])} ${s}w`)
    .join(', ');
}

module.exports = {
  MEDIA_DIR,
  MAX_UPLOAD_BYTES,
  TYPES,
  DEMO_DIR,
  list,
  get,
  addImage,
  replacePhoto,
  updateImage,
  deleteImage,
  seedDemoImages,
  demoAvailable,
  validateBuffer,
  mediaUrl,
  webpSrcset,
  avifSrcset,
  jpgSrcset,
};
