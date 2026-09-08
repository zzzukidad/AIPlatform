'use strict';

/**
 * Public one-page website template.
 * Only factual, supplied business information is ever rendered.
 * No inline styles/scripts (strict CSP) — everything lives in /css and /js.
 */

const { mediaUrl, webpSrcset, avifSrcset, jpgSrcset } = require('../images');

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FLAME_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 22c4.4 0 7.5-3 7.5-7.2 0-2.5-1.2-4.7-2.6-6.5-.9 1.2-1.9 1.9-2.9 2.2.6-2.9-.4-6.6-3.4-8.5.2 3.1-1 4.8-2.6 6.4C6.4 9.9 4.5 11.7 4.5 14.8 4.5 19 7.6 22 12 22Z"/><path d="M12 22c2 0 3.4-1.4 3.4-3.4 0-1.9-1.5-3-2.4-4.4-1.3 1-2.7 2-2.7 4.1 0 2.1 1.5 3.7 3.4 3.7Z"/></svg>`;

const SERVICE_ICONS = {
  Plumbing: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14.7 6.3a4.2 4.2 0 0 0-5.6 5.2L3 17.6V21h3.4l6.1-6.1a4.2 4.2 0 0 0 5.2-5.6l-2.9 2.9-2.5-.7-.7-2.5 3.1-2.7Z"/></svg>`,
  Gas: FLAME_ICON,
  Repairs: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 6.5a5 5 0 0 1-6.6 6.1L7.6 19.4a2.1 2.1 0 0 1-3-3l6.8-6.8A5 5 0 0 1 17.5 3l-2.8 2.8.7 2.8 2.8.7L21 6.5Z"/></svg>`,
  Installation: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><path d="M14.5 7.5h-5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2Z"/></svg>`,
  General: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="M3 12l9 5 9-5"/><path d="M3 16l9 5 9-5"/></svg>`,
};

const SERVICES = [
  { key: 'Plumbing', title: 'Plumbing', description: 'General plumbing services for homes and businesses.' },
  { key: 'Gas', title: 'Gas', description: 'Gas plumbing and related services.' },
  { key: 'Repairs', title: 'Repairs', description: 'Plumbing repairs and maintenance.' },
  { key: 'Installation', title: 'Installation', description: 'Plumbing and gas installation.' },
];

function pictureSources(image, sizesAttr, eager) {
  const avif = avifSrcset(image);
  const webp = webpSrcset(image);
  const jpg = jpgSrcset(image);
  const fallbackSrc = mediaUrl(image.variants.f1600 || image.variants.w1600);

  if (eager) {
    // First slide: full <picture>, preloaded from <head>, highest priority.
    return (
      (avif ? `<source type="image/avif" srcset="${esc(avif)}" sizes="${esc(sizesAttr)}">` : '') +
      `<source type="image/webp" srcset="${esc(webp)}" sizes="${esc(sizesAttr)}">` +
      `<img src="${esc(fallbackSrc)}" srcset="${esc(jpg)}" sizes="${esc(sizesAttr)}" alt="${esc(image.name)}" fetchpriority="high" decoding="async">`
    );
  }

  // Subsequent slides: sources are hydrated by JS when the slide (or the one
  // after it) becomes active, so nothing off-screen is ever downloaded.
  return (
    (avif ? `<source type="image/avif" data-srcset="${esc(avif)}" sizes="${esc(sizesAttr)}">` : '') +
    `<source type="image/webp" data-srcset="${esc(webp)}" sizes="${esc(sizesAttr)}">` +
    `<img data-src="${esc(fallbackSrc)}" data-srcset="${esc(jpg)}" sizes="${esc(sizesAttr)}" alt="${esc(image.name)}" decoding="async">`
  );
}

function heroSlide(image, index, total) {
  const eager = index === 0;
  const content = `
            <div class="hero-slide-content">
              ${image.type ? `<p class="hero-slide-eyebrow">${esc(image.type)}</p>` : ''}
              <p class="hero-slide-title">${esc(image.name)}</p>
              ${image.cta ? `<a class="btn btn-light" href="#contact">${esc(image.cta)}</a>` : ''}
            </div>`;
  return `
          <div class="hero-slide${eager ? ' is-active' : ''}" role="group" aria-roledescription="slide" aria-label="Slide ${index + 1} of ${total}"${eager ? '' : ' aria-hidden="true"'}>
            <div class="hero-slide-media">${pictureSources(image, '100vw', eager)}</div>
            <div class="hero-slide-scrim" aria-hidden="true"></div>${content}
          </div>`;
}

function fallbackHero() {
  return `
          <div class="hero-slide is-active" role="group" aria-roledescription="slide" aria-label="Welcome">
            <div class="hero-fallback" aria-hidden="true">
              <div class="hero-fallback-grid"></div>
              <div class="hero-fallback-glow"></div>
              <div class="hero-fallback-mark">${FLAME_ICON}</div>
            </div>
            <div class="hero-slide-scrim" aria-hidden="true"></div>
            <div class="hero-slide-content">
              <p class="hero-slide-eyebrow">Plumbing &amp; Gas</p>
              <p class="hero-slide-title">Every job done properly.</p>
              <a class="btn btn-light" href="#contact">Contact Us</a>
            </div>
          </div>`;
}

function serviceCard(service, image, index) {
  const media = image
    ? `<div class="service-card-media"><img src="${esc(mediaUrl(image.variants.w960))}" alt="${esc(image.name)}" loading="lazy" decoding="async"></div>`
    : `<div class="service-card-media service-card-media-blank" aria-hidden="true">${SERVICE_ICONS[service.key] || SERVICE_ICONS.General}</div>`;
  return `
          <article class="service-card reveal" data-delay="${index % 4}">
            ${media}
            <div class="service-card-body">
              <div class="service-card-icon" aria-hidden="true">${SERVICE_ICONS[service.key] || SERVICE_ICONS.General}</div>
              <h3>${esc(service.title)}</h3>
              <p>${esc(service.description)}</p>
              <a class="service-card-link" href="#contact">Enquire<span aria-hidden="true"> &rarr;</span><span class="visually-hidden"> about ${esc(service.title)}</span></a>
            </div>
          </article>`;
}

function workGallery(images) {
  if (images.length < 2) return '';
  const tiles = images
    .map(
      (image, i) => `
            <figure class="work-tile${i === 0 ? ' work-tile-wide' : ''} reveal" data-delay="${i % 3}">
              <img src="${esc(mediaUrl(image.variants.w960))}" srcset="${esc(webpSrcset(image))}" sizes="(min-width: 900px) 50vw, 100vw" alt="${esc(image.name)}" loading="lazy" decoding="async">
              <figcaption><span class="work-tile-eyebrow">${esc(image.type || 'Work')}</span><span class="work-tile-name">${esc(image.name)}</span></figcaption>
            </figure>`
    )
    .join('');
  const ctaTile = images.length % 2 === 0
    ? `
            <a class="work-tile work-tile-cta reveal" data-delay="${images.length % 3}" href="#contact">
              <span class="work-tile-cta-title">Like what you see?</span>
              <span class="work-tile-cta-sub">Discuss your project<span aria-hidden="true"> &rarr;</span></span>
            </a>`
    : '';
  return `
    <section class="section section-dark" id="work" aria-labelledby="work-title">
      <div class="container">
        <div class="section-head reveal">
          <p class="eyebrow">Our Work</p>
          <h2 id="work-title" class="section-title">Recent jobs, real results.</h2>
          <p class="section-sub">A snapshot of the work delivered by Dragon Gas &amp; Plumbing.</p>
        </div>
        <div class="work-grid">${tiles}${ctaTile}
        </div>
      </div>
    </section>`;
}

function aboutSection(image) {
  const media = image
    ? `<div class="about-media reveal">
          <img src="${esc(mediaUrl(image.variants.f1600 || image.variants.w1600))}" srcset="${esc(jpgSrcset(image))}" sizes="(min-width: 900px) 50vw, 100vw" alt="${esc(image.name)}" loading="lazy" decoding="async">
          <div class="about-chip">
            <span class="about-chip-icon" aria-hidden="true">${FLAME_ICON}</span>
            <span><strong>Kainian Wang</strong><small>Owner / Operator</small></span>
          </div>
        </div>`
    : `<div class="about-media about-media-placeholder reveal" aria-hidden="true">
          <div class="about-placeholder-mark">${FLAME_ICON}</div>
          <div class="about-chip">
            <span><strong>Kainian Wang</strong><small>Owner / Operator</small></span>
          </div>
        </div>`;
  return `
    <section class="section" id="about" aria-labelledby="about-title">
      <div class="container about-grid">
        ${media}
        <div class="about-body">
          <p class="eyebrow reveal">About</p>
          <h2 id="about-title" class="section-title reveal" data-delay="1">Local Plumbing.<br>Straightforward Service.</h2>
          <p class="about-copy reveal" data-delay="2">Dragon Gas &amp; Plumbing is a local Western Australian plumbing and gas business operated by <strong>Kainian Wang</strong>.</p>
          <ul class="about-points reveal" data-delay="3">
            <li>Locally operated &mdash; WA 6155</li>
            <li>Plumbing &amp; gas services</li>
            <li>Owner-run, personal service</li>
          </ul>
          <div class="about-actions reveal" data-delay="4">
            <a class="btn btn-primary" href="#contact">Contact Us</a>
            <a class="btn btn-ghost" href="#work">See our work</a>
          </div>
        </div>
      </div>
    </section>`;
}

/**
 * Render the homepage.
 * @param {Array} images  uploaded slide records, in display order
 * @param {Object} opts   { nonce, canonicalUrl, ogImage }
 */
function renderHome(images, opts) {
  const slides = images;
  const hasSlides = slides.length > 0;

  const first = hasSlides ? slides[0] : null;
  const aboutImage = hasSlides ? slides[(1) % slides.length] : null;
  // Gallery shows everything except the about image so no photo appears
  // more than twice on the page.
  const galleryImages = hasSlides ? slides.filter((img) => img !== aboutImage) : [];

  // Service card imagery: match by service type first, then share the pool.
  const pool = slides.slice();
  const serviceImages = SERVICES.map((service) => {
    const byType = pool.find((img) => img.type === service.key);
    if (byType) return byType;
    return pool.length ? pool[SERVICES.indexOf(service) % pool.length] : null;
  });

  const ogImage = opts.ogImage ? `<meta property="og:image" content="${esc(opts.ogImage)}">` : '';

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Plumber',
    name: 'Dragon Gas & Plumbing',
    description: 'Dragon Gas & Plumbing is a local Western Australian plumbing and gas business operated by Kainian Wang.',
    founder: { '@type': 'Person', name: 'Kainian Wang' },
    address: {
      '@type': 'PostalAddress',
      addressRegion: 'WA',
      postalCode: '6155',
      addressCountry: 'AU',
    },
    areaServed: 'WA 6155',
    url: opts.canonicalUrl,
  };

  const preload = first
    ? `<link rel="preload" as="image" href="${esc(mediaUrl(first.variants.f1600 || first.variants.w1600))}" imagesrcset="${esc(webpSrcset(first))}" imagesizes="100vw">`
    : '';

  const heroSlides = hasSlides ? slides.map((img, i) => heroSlide(img, i, slides.length)).join('') : fallbackHero();

  const controls = hasSlides && slides.length > 1
    ? `
        <button class="hero-arrow hero-arrow-prev" type="button" data-hero-prev aria-label="Previous slide">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button class="hero-arrow hero-arrow-next" type="button" data-hero-next aria-label="Next slide">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"/></svg>
        </button>
        <div class="hero-dots" role="tablist" aria-label="Choose slide">
          ${slides
            .map(
              (_, i) =>
                `<button class="hero-dot${i === 0 ? ' is-active' : ''}" type="button" role="tab" data-hero-dot="${i}" aria-label="Go to slide ${i + 1}"${i === 0 ? ' aria-selected="true"' : ' aria-selected="false"'}></button>`
            )
            .join('')}
        </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dragon Gas &amp; Plumbing | Plumbing &amp; Gas Services WA</title>
  <meta name="description" content="Dragon Gas &amp; Plumbing is a local Western Australian plumbing and gas business operated by Kainian Wang. Contact us to discuss your plumbing or gas requirements.">
  <link rel="canonical" href="${esc(opts.canonicalUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Dragon Gas &amp; Plumbing">
  <meta property="og:title" content="Dragon Gas &amp; Plumbing | Plumbing &amp; Gas Services WA">
  <meta property="og:description" content="Local Western Australian plumbing and gas services operated by Kainian Wang.">
  <meta property="og:url" content="${esc(opts.canonicalUrl)}">
  ${ogImage}
  <meta name="theme-color" content="#0b1220">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preload" as="font" type="font/woff2" href="/fonts/sora-latin-700-normal.woff2" crossorigin>
  <link rel="preload" as="font" type="font/woff2" href="/fonts/inter-latin-400-normal.woff2" crossorigin>
  ${preload}
  <link rel="stylesheet" href="/css/home.css">
  <script type="application/ld+json" nonce="${esc(opts.nonce)}">${JSON.stringify(structuredData)}</script>
  <script src="/js/home.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>

  <header class="nav" data-nav>
    <div class="container nav-inner">
      <a class="nav-brand" href="/" aria-label="Dragon Gas &amp; Plumbing — home">
        <span class="nav-brand-mark" aria-hidden="true">${FLAME_ICON}</span>
        <span class="nav-brand-name">Dragon Gas &amp; Plumbing</span>
      </a>
      <nav class="nav-links" aria-label="Primary">
        <a href="#services">Services</a>
        <a href="#about">About</a>
        <a href="#work">Work</a>
        <a class="btn btn-nav" href="#contact">Contact Us</a>
      </nav>
      <button class="nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-controls="mobile-menu" aria-label="Open menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>

  <div class="mobile-menu" id="mobile-menu" data-mobile-menu hidden>
    <nav aria-label="Mobile">
      <a href="#services">Services</a>
      <a href="#about">About</a>
      <a href="#work">Work</a>
      <a class="btn btn-primary" href="#contact">Contact Us</a>
    </nav>
    <p class="mobile-menu-foot">Dragon Gas &amp; Plumbing &middot; WA 6155</p>
  </div>

  <main id="main">
    <!-- ===================== HERO / SLIDESHOW ===================== -->
    <section class="hero${slides.length > 1 ? ' is-playing' : ''}" data-hero aria-roledescription="carousel" aria-label="Showcase highlights"${hasSlides ? '' : ' data-hero-static="true"'}>
      <div class="hero-track" data-hero-track>${heroSlides}
      </div>

      <div class="hero-branding container">
        <p class="hero-kicker reveal-hero"><span class="hero-kicker-dot" aria-hidden="true"></span>Locally owned &middot; WA 6155</p>
        <h1 class="hero-title reveal-hero" data-delay="1">Dragon Gas &amp; Plumbing</h1>
        <p class="hero-subtitle reveal-hero" data-delay="2">Reliable Plumbing &amp; Gas Services</p>
        <p class="hero-copy reveal-hero" data-delay="3">Local plumbing and gas services from Dragon Gas &amp; Plumbing.</p>
      </div>

      ${controls}
      <div class="hero-scroll" aria-hidden="true"><span></span></div>
    </section>

    <!-- ===================== SERVICES ===================== -->
    <section class="section" id="services" aria-labelledby="services-title">
      <div class="container">
        <div class="section-head reveal">
          <p class="eyebrow">What we do</p>
          <h2 id="services-title" class="section-title">Plumbing &amp; Gas Services</h2>
          <p class="section-sub">Straightforward service, done properly &mdash; for homes and businesses around WA 6155.</p>
        </div>
        <div class="services-grid">
          ${SERVICES.map((service, i) => serviceCard(service, serviceImages[i], i)).join('')}
        </div>
      </div>
    </section>

    <!-- ===================== ABOUT ===================== -->
${aboutSection(aboutImage)}

    <!-- ===================== WORK ===================== -->
${workGallery(galleryImages)}

    <!-- ===================== CONTACT ===================== -->
    <section class="section section-dark contact" id="contact" aria-labelledby="contact-title">
      <div class="container contact-inner">
        <p class="eyebrow reveal">Contact</p>
        <h2 id="contact-title" class="contact-title reveal" data-delay="1">Need plumbing or gas assistance?</h2>
        <p class="contact-copy reveal" data-delay="2">Get in touch with Dragon Gas &amp; Plumbing to discuss your requirements.</p>
        <div class="contact-actions reveal" data-delay="3">
          <a class="btn btn-primary btn-xl" href="#contact" id="contact-cta">Contact Us</a>
        </div>
        <div class="contact-meta reveal" data-delay="4">
          <span>Locally operated</span>
          <span aria-hidden="true">&middot;</span>
          <span>WA 6155</span>
          <span aria-hidden="true">&middot;</span>
          <span>Kainian Wang &mdash; Owner / Operator</span>
        </div>
        <!-- Future extension: add tel:/mailto: links or an enquiry form here once
             contact details are supplied. -->
      </div>
    </section>
  </main>

  <!-- ===================== FOOTER ===================== -->
  <footer class="footer">
    <div class="container footer-inner">
      <div class="footer-brand">
        <span class="nav-brand-mark" aria-hidden="true">${FLAME_ICON}</span>
        <div>
          <p class="footer-name">Dragon Gas &amp; Plumbing</p>
          <p class="footer-owner">Kainian Wang &mdash; Owner / Operator</p>
        </div>
      </div>
      <div class="footer-details">
        <p>WA 6155, Australia</p>
        <p>ABN 60 704 717 461</p>
      </div>
      <p class="footer-copy">&copy; 2026 Dragon Gas &amp; Plumbing. All rights reserved.</p>
    </div>
  </footer>

  <noscript>
    <link rel="stylesheet" href="/css/nojs.css">
  </noscript>
</body>
</html>`;
}

module.exports = { renderHome, esc };
