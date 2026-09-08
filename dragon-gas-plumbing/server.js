'use strict';

/**
 * Dragon Gas & Plumbing — public one-page website + simple image manager.
 *
 * Public:   cinematic hero slideshow fed by owner-uploaded photos, services,
 *           about, work showcase, contact CTA, footer.
 * Admin:    /admin — login, upload, edit, delete slideshow images. Nothing else.
 *
 * No database server required: JSON files + processed media live in /data.
 */

/* ---- tiny .env loader (no dependency) ---- */
const fs = require('fs');
const path = require('path');
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
})();

const crypto = require('crypto');
const express = require('express');
const compression = require('compression');
const multer = require('multer');

const auth = require('./src/auth');
const images = require('./src/images');
const homeView = require('./src/views/home');
const adminView = require('./src/views/admin');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' || IS_PROD;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

/* ---------------- security headers ---------------- */

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(compression());

/* ---------------- static assets ---------------- */

const staticOpts = IS_PROD ? { maxAge: '7d' } : { etag: true };
express.static.mime.define({ 'image/avif': ['avif'] });
app.use(express.static(path.join(__dirname, 'public'), staticOpts));
app.use(
  '/media',
  express.static(images.MEDIA_DIR, { maxAge: '30d', immutable: true, fallthrough: false })
);

/* ---------------- helpers ---------------- */

function currentUser(req) {
  const token = req.cookies ? req.cookies[auth.SESSION_COOKIE] : null;
  return auth.getSession(token);
}

/* Minimal cookie parser (avoids an extra dependency). */
function cookieParser(req, res, next) {
  const header = req.headers.cookie;
  req.cookies = {};
  if (header) {
    for (const pair of header.split(';')) {
      const idx = pair.indexOf('=');
      if (idx === -1) continue;
      const key = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (key) req.cookies[key] = decodeURIComponent(value);
    }
  }
  next();
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: COOKIE_SECURE,
    maxAge: auth.SESSION_TTL_MS,
    path: '/',
  };
}

function csrfCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: COOKIE_SECURE,
    maxAge: 60 * 60 * 1000,
    path: '/admin',
  };
}

function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/admin';
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

/* ---------------- public site ---------------- */

app.get('/', (req, res) => {
  const list = images.list();
  const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const canonicalUrl = `${proto}://${host}/`;
  const nonce = crypto.randomBytes(16).toString('hex');

  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`
  );
  res.setHeader('Cache-Control', 'no-cache');

  const ogImage = list.length ? `${canonicalUrl.slice(0, -1)}${images.mediaUrl(list[0].variants.w960)}` : null;

  res.send(homeView.renderHome(list, { nonce, canonicalUrl, ogImage }));
});

/* ---------------- admin: auth ---------------- */

const adminNoStore = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
  next();
};

app.use('/admin', express.json({ limit: '10kb' }));
app.use('/admin', express.urlencoded({ extended: false, limit: '10kb' }));
app.use('/admin', cookieParser);
app.use('/admin', adminNoStore);

app.get('/admin', (req, res) => {
  res.redirect(currentUser(req) ? '/admin/dashboard' : '/admin/login');
});

app.get('/admin/login', (req, res) => {
  if (currentUser(req)) return res.redirect('/admin/dashboard');
  const csrf = crypto.randomBytes(24).toString('hex');
  res.cookie(auth.CSRF_COOKIE, csrf, csrfCookieOptions());
  res.send(adminView.loginPage({ csrf, error: req.query.err === '1' ? 'Incorrect username or password.' : null }));
});

app.post('/admin/login', (req, res) => {
  const ip = clientIp(req);
  const rate = auth.checkRateLimit(ip);
  if (!rate.allowed) {
    return res.status(429).send(
      adminView.loginPage({ csrf: '', rateLimited: true, error: `Too many attempts. Try again in about ${Math.ceil(rate.retryAfterSec / 60)} minute(s).` })
    );
  }

  const bodyCsrf = req.body && req.body._csrf;
  const cookieCsrf = req.cookies ? req.cookies[auth.CSRF_COOKIE] : null;
  if (!bodyCsrf || !cookieCsrf || !auth.safeEqual(bodyCsrf, cookieCsrf)) {
    return res.status(403).send(adminView.loginPage({ csrf: '', error: 'Your session expired. Please try again.' }));
  }

  const username = String((req.body && req.body.username) || '');
  const password = String((req.body && req.body.password) || '');
  const usernameOk = auth.safeEqual('admin', username);
  const passwordOk = auth.verifyPassword(password);

  if (!usernameOk || !passwordOk) {
    return res.status(401).send(adminView.loginPage({ csrf: cookieCsrf, error: 'Incorrect username or password.' }));
  }

  auth.clearRateLimit(ip);
  const { token } = auth.createSession();
  res.clearCookie(auth.CSRF_COOKIE, { path: '/admin' });
  res.cookie(auth.SESSION_COOKIE, token, sessionCookieOptions());
  res.redirect('/admin/dashboard');
});

function requireAuth(req, res, next) {
  const session = currentUser(req);
  if (!session) {
    return res.redirect('/admin/login');
  }
  req.session = session;
  next();
}

function requireCsrf(req, res, next) {
  const provided = req.body && req.body._csrf;
  if (!provided || !req.session || !auth.safeEqual(provided, req.session.csrf)) {
    return res.status(403).send('Invalid request. Please go back and try again.');
  }
  next();
}

/** CSRF check for multipart routes, after multer has parsed req.body. */
function checkCsrfBody(req) {
  const provided = req.body && req.body._csrf;
  return Boolean(provided && req.session && auth.safeEqual(provided, req.session.csrf));
}

app.post('/admin/logout', requireAuth, requireCsrf, (req, res) => {
  auth.destroySession(req.cookies[auth.SESSION_COOKIE]);
  res.clearCookie(auth.SESSION_COOKIE, { path: '/' });
  res.redirect('/admin/login?msg=loggedout');
});

/* ---------------- admin: image management ---------------- */

app.get('/admin/dashboard', requireAuth, (req, res) => {
  const msgWhitelist = ['uploaded', 'saved', 'deleted', 'seeded'];
  const msg = msgWhitelist.includes(req.query.msg) ? req.query.msg : null;
  res.send(
    adminView.dashboardPage({
      images: images.list(),
      csrf: req.session.csrf,
      msg,
      demoAvailable: images.demoAvailable(),
    })
  );
});

app.get('/admin/upload', requireAuth, (req, res) => {
  res.send(adminView.imageFormPage({ mode: 'upload', csrf: req.session.csrf, image: null, error: null }));
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: images.MAX_UPLOAD_BYTES, files: 1 },
});

function handleUploadError(res, err, mode, image, csrf) {
  const message =
    err.code === 'LIMIT_FILE_SIZE'
      ? 'That file is too large. Maximum size is 15 MB.'
      : err.message === 'unsupported-format' || err.message === 'not-a-valid-image'
        ? 'That file does not look like a valid JPEG, PNG or WebP photo.'
        : 'Something went wrong while processing that image. Please try another photo.';
  res.status(400).send(adminView.imageFormPage({ mode, image, csrf, error: message }));
}

/* Multipart routes: auth first, then multer parses the body (populating
 * req.body), then the CSRF token from the form can be verified. */
app.post('/admin/upload', requireAuth, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return handleUploadError(res, err, 'upload', null, req.session.csrf);
    if (!checkCsrfBody(req)) return res.status(403).send('Invalid request. Please go back and try again.');
    try {
      if (!req.file) throw new Error('not-a-valid-image');
      await images.addImage(
        { name: req.body.name, type: req.body.type, cta: req.body.cta },
        req.file.buffer
      );
      res.redirect('/admin/dashboard?msg=uploaded');
    } catch (processErr) {
      handleUploadError(res, processErr, 'upload', null, req.session.csrf);
    }
  });
});

app.get('/admin/images/:id/edit', requireAuth, (req, res) => {
  const image = images.get(req.params.id);
  if (!image) return res.redirect('/admin/dashboard');
  res.send(adminView.imageFormPage({ mode: 'edit', image, csrf: req.session.csrf, error: null }));
});

app.post('/admin/images/:id/edit', requireAuth, (req, res) => {
  const image = images.get(req.params.id);
  if (!image) return res.redirect('/admin/dashboard');
  upload.single('image')(req, res, async (err) => {
    if (err) return handleUploadError(res, err, 'edit', image, req.session.csrf);
    if (!checkCsrfBody(req)) return res.status(403).send('Invalid request. Please go back and try again.');
    try {
      if (req.file) await images.replacePhoto(image.id, req.file.buffer);
      await images.updateImage(image.id, {
        name: req.body.name,
        type: req.body.type,
        cta: req.body.cta,
      });
      res.redirect('/admin/dashboard?msg=saved');
    } catch (processErr) {
      handleUploadError(res, processErr, 'edit', images.get(image.id) || image, req.session.csrf);
    }
  });
});

app.post('/admin/images/:id/delete', requireAuth, requireCsrf, async (req, res) => {
  await images.deleteImage(req.params.id);
  res.redirect('/admin/dashboard?msg=deleted');
});

app.post('/admin/demo/seed', requireAuth, requireCsrf, async (req, res) => {
  try {
    await images.seedDemoImages();
    res.redirect('/admin/dashboard?msg=seeded');
  } catch (err) {
    res.redirect('/admin/dashboard');
  }
});

/* ---------------- 404 + error handling ---------------- */

app.use((req, res) => {
  res.status(404).send('Not found');
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).send('Server error');
});

/* ---------------- boot ---------------- */

const initialPassword = auth.ensureInitialPassword();
setInterval(() => auth.purgeExpiredSessions(), 60 * 60 * 1000).unref();

app.listen(PORT, HOST, () => {
  console.log(`Dragon Gas & Plumbing running at http://localhost:${PORT}`);
  if (initialPassword) {
    console.log('──────────────────────────────────────────────────');
    console.log('  First-run setup — admin panel initial password:');
    console.log('');
    console.log(`  admin / ${initialPassword}`);
    console.log('');
    console.log('  Change it any time with:  npm run reset-password');
    console.log('──────────────────────────────────────────────────');
  }
});
