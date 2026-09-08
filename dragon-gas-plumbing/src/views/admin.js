'use strict';

/**
 * Admin panel templates. Intentionally plain and functional:
 * Login -> Upload -> Name -> Type -> CTA -> Save. Nothing more.
 */

const { TYPES } = require('../images');

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${esc(title)} — Dragon Gas &amp; Plumbing Admin</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/css/admin.css">
  <script src="/js/admin.js" defer></script>
</head>
<body>
${body}
</body>
</html>`;
}

function banner() {
  return `<header class="topbar">
    <div class="topbar-inner">
      <div class="topbar-brand">
        <strong>Dragon Gas &amp; Plumbing</strong>
        <span>Image Manager</span>
      </div>
      <a class="topbar-link" href="/" target="_blank" rel="noopener">View site ↗</a>
    </div>
  </header>`;
}

function flash(msg) {
  const messages = {
    uploaded: 'Image uploaded. The website has been updated.',
    saved: 'Changes saved. The website has been updated.',
    deleted: 'Image deleted.',
    seeded: 'Starter photos added.',
    loggedout: 'You have been logged out.',
  };
  if (!messages[msg]) return '';
  return `<div class="flash" role="status">${esc(messages[msg])}</div>`;
}

/* ---------------- login ---------------- */

function loginPage({ csrf, error, rateLimited }) {
  return page('Log in', `
<main class="login-wrap">
  <form class="login-card" method="post" action="/admin/login">
    <h1>Dragon Gas &amp; Plumbing</h1>
    <p class="login-sub">Admin login</p>
    ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
    ${rateLimited ? `<p class="form-error" role="alert">Too many attempts. Please wait a few minutes and try again.</p>` : ''}
    <input type="hidden" name="_csrf" value="${esc(csrf)}">
    <label>Username
      <input type="text" name="username" autocomplete="username" required autofocus>
    </label>
    <label>Password
      <input type="password" name="password" autocomplete="current-password" required>
    </label>
    <button class="btn btn-primary btn-block" type="submit">Log in</button>
  </form>
</main>`);
}

/* ---------------- dashboard ---------------- */

function dashboardPage({ images, csrf, msg, demoAvailable }) {
  const cards = images
    .map(
      (img) => `
        <li class="image-card">
          <div class="image-card-thumb">
            <img src="/media/${esc(img.thumb)}" alt="${esc(img.name)}" loading="lazy">
          </div>
          <div class="image-card-body">
            <strong class="image-card-name">${esc(img.name || 'Untitled')}</strong>
            <span class="chip">${esc(img.type || 'General')}</span>
            ${img.cta ? `<span class="chip chip-cta">CTA: ${esc(img.cta)}</span>` : '<span class="chip chip-muted">No CTA</span>'}
          </div>
          <div class="image-card-actions">
            <a class="btn btn-small" href="/admin/images/${esc(img.id)}/edit">Edit</a>
            <form method="post" action="/admin/images/${esc(img.id)}/delete" data-confirm="Delete “${esc(img.name || 'Untitled')}”? This cannot be undone.">
              <input type="hidden" name="_csrf" value="${esc(csrf)}">
              <button class="btn btn-small btn-danger" type="submit">Delete</button>
            </form>
          </div>
        </li>`
    )
    .join('');

  return page('Image Manager', `
${banner()}
<main class="wrap">
  ${flash(msg)}
  <div class="dash-head">
    <h1>Image Manager</h1>
    <div class="dash-actions">
      ${images.length === 0 && demoAvailable
        ? `<form method="post" action="/admin/demo/seed" class="inline-form" data-confirm="Add the 4 starter photos to the slideshow? You can delete them later.">
             <input type="hidden" name="_csrf" value="${esc(csrf)}">
             <button class="btn" type="submit">Add starter photos</button>
           </form>`
        : ''}
      <a class="btn btn-primary" href="/admin/upload">+ Upload Image</a>
      <form method="post" action="/admin/logout" class="inline-form">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <button class="btn btn-small" type="submit">Log out</button>
      </form>
    </div>
  </div>

  ${images.length === 0
    ? `<div class="empty-state">
         <p><strong>No images yet.</strong></p>
         <p>Upload your first photo and it will appear in the website slideshow automatically.</p>
         <a class="btn btn-primary" href="/admin/upload">+ Upload Image</a>
       </div>`
    : `<p class="dash-note">${images.length} image${images.length === 1 ? '' : 's'} — shown in the slideshow in this order.</p>
       <ul class="image-grid">${cards}
       </ul>`}
</main>`);
}

/* ---------------- upload / edit form ---------------- */

function typeOptions(selected) {
  return TYPES.map((t) => `<option value="${esc(t)}"${t === selected ? ' selected' : ''}>${esc(t)}</option>`).join('');
}

function imageFormPage({ mode, image, csrf, error }) {
  const isEdit = mode === 'edit';
  const action = isEdit ? `/admin/images/${esc(image.id)}/edit` : '/admin/upload';
  const title = isEdit ? 'Edit Image' : 'Upload Image';

  return page(title, `
${banner()}
<main class="wrap wrap-narrow">
  <div class="dash-head">
    <h1>${title}</h1>
    <a class="btn btn-small" href="/admin">← Back</a>
  </div>

  ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}

  <form class="panel form-grid" method="post" action="${action}" enctype="multipart/form-data">
    <input type="hidden" name="_csrf" value="${esc(csrf)}">

    <label>${isEdit ? 'Replace photo (optional)' : 'Photo'}
      <input type="file" name="image" accept="image/jpeg,image/png,image/webp"${isEdit ? '' : ' required'}>
      <small>JPEG, PNG or WebP. Up to 15 MB. Phone photos are fine — the site crops them automatically.</small>
    </label>

    <div class="preview" data-preview hidden></div>

    <label>Name
      <input type="text" name="name" maxlength="90" required value="${esc(image ? image.name : '')}" placeholder="Bathroom Renovation">
    </label>

    <label>Type
      <select name="type">
        ${typeOptions(image ? image.type : 'Plumbing')}
      </select>
    </label>

    <label>CTA <small>(optional button text)</small>
      <input type="text" name="cta" maxlength="40" value="${esc(image ? image.cta : '')}" placeholder="Contact Us">
    </label>

    <div class="form-actions">
      <button class="btn btn-primary" type="submit" data-busy-text="${isEdit ? 'Saving…' : 'Processing…'}">${isEdit ? 'Save Changes' : 'Upload Image'}</button>
      <a class="btn" href="/admin">Cancel</a>
    </div>
  </form>
</main>`);
}

module.exports = { loginPage, dashboardPage, imageFormPage, esc };
