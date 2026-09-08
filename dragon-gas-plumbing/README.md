# Dragon Gas & Plumbing

Premium one-page website with a cinematic hero slideshow, plus a deliberately
simple `/admin` panel for managing slideshow images.

- **Public site** — `/`
- **Admin panel** — `/admin` (username: `admin`)

## Quick start

```bash
npm install
npm start
```

On first start the server generates a **secure random admin password** and
prints it once to the console. Log in at `/admin` with username `admin`.

### Change the admin password

```bash
npm run reset-password              # generates a new secure random password
npm run reset-password "new secret" # or set one explicitly (10+ chars)
```

## How it works

```
Owner → /admin → login → Upload Image → Name / Type / CTA → Save
      → files processed into WebP/AVIF/JPEG variants in data/media
      → public website slideshow updates automatically (no code changes)
```

- Images are validated (MIME via decoding), stored with random filenames and
  resized into responsive variants. Originals are never kept.
- With no images uploaded, the site shows a designed fallback hero — no broken
  carousels. The first upload replaces it instantly.
- The optional **Add starter photos** button in the admin dashboard imports the
  four demo photos from `demo-seed/` so the owner can see the site fully
  dressed before uploading their own work. Photos can be deleted like any other.

## Configuration (optional)

Copy `.env.example` to `.env`. Everything is optional:

| Variable        | Default     | Purpose                                  |
| --------------- | ----------- | ---------------------------------------- |
| `PORT`          | `3000`      | Listen port                              |
| `HOST`          | `0.0.0.0`   | Bind address                             |
| `NODE_ENV`      | development | `production` enables asset caching       |
| `COOKIE_SECURE` | `false`     | Set `true` behind HTTPS (HSTS + secure cookies) |

## Data & storage

- `data/media/` — processed image variants (safe to back up; regenerate by re-upload)
- `data/images.json` — image records and display order
- `data/auth.json` — scrypt password hash
- `data/sessions.json` — admin sessions

All of `data/` is gitignored. Deleting `data/` resets everything (including the
admin password, which is regenerated on next boot).

## Security notes

- Password hashed with scrypt; never stored or logged in plain text.
- HTTP-only `SameSite=Strict` session cookies (7-day expiry).
- CSRF tokens on every admin form (login uses a signed double-submit cookie).
- Login rate limiting: 8 attempts per IP per 15 minutes.
- Strict CSP on both public and admin pages; no inline scripts/styles.
- Uploads: 15 MB cap, decoded with sharp to verify real image data, random hex
  filenames, originals discarded.

## Deployment

Any Node.js 18+ host works. Recommended: run behind a reverse proxy with HTTPS
(`COOKIE_SECURE=true`, `NODE_ENV=production`), e.g.:

```bash
NODE_ENV=production COOKIE_SECURE=true PORT=3000 node server.js
```
