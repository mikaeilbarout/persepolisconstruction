# Persepolis Construction

Full site for a UK construction company based in Birmingham: a static
multi-page frontend plus a FastAPI + SQLite backend that powers the projects
gallery, testimonials, and quote request form. An admin panel lets the
company update project photos, descriptions, testimonials, and their own
login/account without touching code.

```
persepolis-project/
├── backend/           FastAPI + SQLite API
│   ├── app/
│   │   ├── main.py            app entrypoint, CORS, static files
│   │   ├── config.py          settings loaded from .env
│   │   ├── database.py        SQLAlchemy engine/session
│   │   ├── models.py          Project, ProjectImage, Testimonial, QuoteRequest,
│   │   │                      AdminAccount, SiteContent tables
│   │   ├── schemas.py         Pydantic request/response models
│   │   ├── security.py        password hashing + JWT
│   │   ├── email_utils.py     best-effort SMTP sender (skips silently if unset)
│   │   └── routers/           auth, projects, testimonials, quotes, content
│   ├── static/uploads/        uploaded project photos land here
│   ├── requirements.txt
│   ├── .env.example            copy to .env and fill in
│   └── .env                    your real config (git-ignored)
└── frontend/           Static HTML/CSS/JS (no build step)
    ├── index.html      home — pinned-image hero + story scroll
    ├── services.html
    ├── projects.html   before/after project gallery with category filter
    ├── about.html
    ├── contact.html    quote form, embedded Google Map, contact icons
    ├── admin.html      admin panel (login required)
    ├── style.css       shared styles for the public site
    ├── script.js       shared logic for the public site
    ├── admin.js        admin panel logic
    └── assets/column-statue.png
```

## Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
```

Generate a password hash for your admin account and paste it into `.env`:

```bash
python -c "from passlib.hash import bcrypt; print(bcrypt.hash('your-password'))"
```

Fill in `.env`:
- `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` — used only to create the admin
  account the *first* time the server ever starts (seeds the `admin_account`
  table). After that, the password and recovery email live in the database
  and are changed from the admin panel's **Account** tab, not by editing
  this file again.
- `JWT_SECRET_KEY` — any long random string (`python -c "import secrets; print(secrets.token_urlsafe(48))"`)
- `CORS_ORIGINS` — the URL(s) the frontend is served from
- `FRONTEND_URL` — used to build the link inside password-reset emails
- `SMTP_*` — optional; leave blank to disable email sending entirely (nothing
  breaks, sends are just skipped and logged). Fill in a real provider to
  enable password-reset emails and new-quote/new-review notifications — see
  **Password recovery & email notifications** below.

Run the server:

```bash
uvicorn app.main:app --reload --port 8000
```

The API is now at `http://127.0.0.1:8000`. Interactive docs at
`http://127.0.0.1:8000/docs`. The SQLite file (`persepolis.db`) and tables are
created automatically on first run — no migration step.

## Frontend setup

The frontend is plain HTML/CSS/JS — no build step. Serve the `frontend/`
folder with any static server, for example:

```bash
cd frontend
python -m http.server 5500
```

Open `http://127.0.0.1:5500`. If the backend isn't running, the pages still
work — the projects/testimonials sections fall back to their placeholder
content, and the quote form shows an error asking the visitor to call instead.

If your API runs somewhere other than `http://127.0.0.1:8000`, set this
before `script.js`/`admin.js` load, e.g. add to the `<head>` of each page:

```html
<script>window.PERSEPOLIS_API_BASE = "https://api.yoursite.co.uk";</script>
```

## Admin panel

Go to `frontend/admin.html`, sign in, and:
- **Quote Requests** — see submissions, change status, delete
- **Projects** — add projects, upload any number of photos per project, tag
  each one **Before** / **After** / **Gallery**, publish/unpublish, delete.
  Public pages show a diagonal before/after split cover when both exist, and
  a full lightbox gallery (with thumbnails and a photo counter) on click.
- **Testimonials** — add, approve (only approved ones show on the public
  site, alongside their star rating), delete
- **Site Text** — edit hero copy, phone/email/coverage-area text, footer
  copyright, etc. Changes take effect the next time each page loads.
- **Account** — change your own password, and set/clear the notification
  email used for password recovery and new quote/review alerts.

## Password recovery & email notifications

The admin's credentials live in the database (`admin_account` table), not
`.env`, so they can be changed at runtime:

- **Change password** (while logged in): Account tab → current + new
  password.
- **Forgot password**: the login screen has a "Forgot password?" link. It
  emails a one-time reset link (valid 30 minutes) to whatever notification
  email is set on the account. Opening that link on `admin.html` shows a
  "set new password" screen automatically (driven by a `?reset_token=` query
  param).
- **New quote / new review alerts**: every public quote submission or review
  submission emails a summary to the same notification address.

All of this degrades gracefully with no SMTP configured — the emails are
just skipped (and logged) instead of raising an error, so quote/review
submission and password changes still work even before you've set up a mail
provider. Fill in `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD`
/ `SMTP_FROM_EMAIL` in `.env` to make emails actually go out (see the comment
in `.env.example` for a Gmail app-password example), then restart the
server. Also update `FRONTEND_URL` to your real domain once deployed —
otherwise reset-link emails will point at localhost.

## 404 page

`frontend/404.html` is a custom not-found page matching the site design.
Wire it up as the default error page for whichever static host you use:

- **Nginx:** `error_page 404 /404.html;` inside the `server` block
- **Apache:** `ErrorDocument 404 /404.html`
- **Netlify / Vercel / GitHub Pages:** a file named `404.html` at the root is
  picked up automatically — no config needed

The API itself also returns a plain JSON 404 (`{"detail": "Not found..."}`)
for any unknown `/api/...` route.

## Rate limiting

The backend uses [slowapi](https://github.com/laurentS/slowapi) (in-memory,
per-IP) so the public endpoints can't be hammered:

- Every route defaults to **100 requests/minute** per IP
- `POST /api/auth/login` — **10/minute** (brute-force protection)
- `POST /api/quotes` (quote form) — **5/minute**
- `POST /api/testimonials` (public review submission) — **5/minute**

A client that exceeds a limit gets `429 Too Many Requests`. These limits live
in `app/rate_limit.py` and next to each route if you want to tune them.
Note this is per-process, in-memory storage — fine for a single server
instance; if you ever scale to multiple workers/machines behind a load
balancer, point `Limiter(...)` at Redis instead (slowapi supports this via
`storage_uri`).

## Security

- **SQL injection:** not possible through normal use — every query goes
  through SQLAlchemy's ORM with parameterized queries. There is no raw SQL
  or string-built query anywhere in the codebase.
- **Stored XSS:** public visitors can submit free text (quote requests,
  reviews) that later gets displayed — including inside the admin panel,
  which holds the admin's session token. All user-submitted text is
  HTML-escaped at render time in both `script.js` and `admin.js` before
  being inserted into the page, so a review containing `<script>` or similar
  is displayed as inert text, not executed.
- **Oversized payloads:** every free-text field has a `max_length` in the
  Pydantic schemas (e.g. 2000–4000 characters), a global request-size guard
  rejects any request body over 10 MB before it's parsed, and image uploads
  are capped at 8 MB.
- **Malicious file uploads:** the saved file's extension is derived from the
  server's own whitelist mapping of validated content-types
  (`image/jpeg` → `.jpg`, etc.) — never from the client-supplied filename —
  so a file renamed to end in `.php` or similar can't change what lands on
  disk. Filenames are randomly generated (no path traversal), and images are
  served as static files with no code execution path.
- **Auth:** admin endpoints require a JWT issued only after a bcrypt
  password check; brute-forcing the login is rate-limited (see above).
- **CORS:** locked to the origins listed in `CORS_ORIGINS` in `.env` —
  update this to your real domain(s) before going live, don't leave it
  wide open.

None of this replaces running behind HTTPS (e.g. via a reverse proxy like
Nginx with Let's Encrypt) in production — plain JWTs and login forms over
HTTP are readable in transit.

## SEO

Every page has a unique `<meta name="description">`, canonical URL, Open
Graph and Twitter Card tags, and a generated 1200×630 share image
(`frontend/assets/og-image.jpg`). `index.html` and `contact.html` also carry
a `schema.org` `GeneralContractor` JSON-LD block (name, phone, email, area
served — Birmingham & the West Midlands, based in Cotteridge — opening
hours, social links) for Google's local-business rich results. The domain
(`persepolisconstruction.co.uk`) is already wired through the meta tags,
JSON-LD, `sitemap.xml`, and `robots.txt`.

**Before launch:**
- The JSON-LD `address` only has a locality/region (Cotteridge, Birmingham)
  — add the real street address for full Google Business / local-search
  benefit.
- Update `sitemap.xml`'s `<lastmod>` dates when content actually changes.
- Submit `sitemap.xml` in Google Search Console once the site is live on the
  real domain.

`admin.html` is marked `noindex` and excluded in `robots.txt` — it shouldn't
appear in search results.

## Icons & PWA manifest

`frontend/assets/` has a full favicon/icon set generated from a simple
column-and-capital mark in the brand colors: `favicon.ico`,
`favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png` (180×180),
and `android-chrome-192x192.png` / `-512x512.png`. `manifest.json` at the
frontend root ties these together so the site can be "installed" to a phone
home screen with a proper name, icon, and theme color.

Want a different mark once the real logo arrives? Send it over and it can
replace these — the current icons are a placeholder, not the final brand.

## Image compression

Project photo uploads are automatically re-encoded server-side before being
saved (`backend/app/routers/projects.py`, `compress_image()`): anything
larger than 1920px on its longest edge is downscaled, and JPEGs/PNGs/WebP
are recompressed (quality 82 for JPEG/WebP). A phone photo that comes in at
4000×3000 and several MB typically lands on disk under ~1.5 MB. This also
doubles as a validation step — Pillow has to successfully decode the bytes
as a real image, rejecting anything that only has the right Content-Type
header.

## Analytics

`frontend/analytics.js` loads nothing by default — no tracking ships out of
the box. To enable Google Analytics (GA4):

```html
<!-- in each page's <head>, before script.js/analytics.js -->
<script>window.PERSEPOLIS_GA_ID = "G-XXXXXXXXXX";</script>
```

Prefer a privacy-friendly alternative? Swap `analytics.js`'s `<script>` tag
for one line from [Plausible](https://plausible.io) or
[Umami](https://umami.is) instead — see the comments at the top of
`analytics.js` for the exact snippets.

## Map

`contact.html` embeds a real Google Maps iframe (no API key needed, via the
`?output=embed` URL form) centered on Birmingham. To point it at an exact
address instead of just the city, change the `q=` parameter in the iframe's
`src`.

## Notes / next steps

- Images upload to `backend/static/uploads/` on the server's local disk. For
  production, consider swapping this for S3/Cloudflare R2 so uploads survive
  redeploys.
- The admin panel currently supports a single admin account (no multi-user
  management) — matches the brief ("if he wants he can change project photos
  and descriptions himself").
- CORS is locked down via `CORS_ORIGINS` in `.env` — update it for your real
  domain(s) before going live (already includes `persepolisconstruction.co.uk`).

### Deployment status

The domain `persepolisconstruction.co.uk` is registered and its DNS is
proxied through Cloudflare, but **no origin server is deployed yet** — right
now this project only runs locally (`127.0.0.1:5500` / `127.0.0.1:8000`).
Visiting the live domain currently returns a Cloudflare 521 ("web server is
down") because Cloudflare has nothing to connect to.

A full Docker Compose stack (`docker-compose.yml`, `backend/Dockerfile`,
`nginx/nginx.conf`, plus `scripts/init-letsencrypt.sh` for Let's Encrypt and
`scripts/setup-firewall.sh` for the VPS's firewall) is ready to deploy —
see **[DEPLOY.md](DEPLOY.md)** for the step-by-step. That's the remaining
step before the site is publicly reachable.
