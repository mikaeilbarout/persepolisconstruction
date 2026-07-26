# Deploying to a VPS

Docker Compose runs three containers: `backend` (FastAPI, internal-only),
`nginx` (serves the static frontend, reverse-proxies `/api/` and `/static/`
to the backend, terminates TLS), and `certbot` (issues/renews the Let's
Encrypt certificate). The host's firewall (not Docker) is what actually
decides what's reachable from the internet.

## 1. Prerequisites

- A VPS running Ubuntu/Debian, with SSH access and a sudo/root user.
- `persepolisconstruction.co.uk` (and `www`) pointed at the VPS's public IP
  in Cloudflare DNS. For the very first certificate issuance, it's safest to
  set both records to **DNS only** (grey cloud, not proxied) — Certbot's
  HTTP-01 challenge needs to reach *this server* directly on port 80, and a
  proxied (orange cloud) record can occasionally interfere with that on the
  first attempt. Switch back to **Proxied** (orange cloud) once the
  certificate exists; renewals afterward tend to work fine either way since
  Cloudflare passes `/.well-known/acme-challenge/` through.
- In Cloudflare's SSL/TLS settings, set the mode to **Full** or **Full
  (strict)** — not "Flexible" — since nginx here always serves real HTTPS on
  443, never plain HTTP to visitors.

## 2. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # log out/in once after this
```

## 3. Get the code onto the VPS

```bash
git clone <your-repo-url> persepolis-project
cd persepolis-project
```

(No git remote yet? `rsync -avz --exclude backend/.env --exclude backend/persepolis.db -e ssh ./ user@your-vps:~/persepolis-project/` from your machine works too.)

## 4. Configure the firewall

```bash
sudo bash scripts/setup-firewall.sh
```

Opens only SSH, HTTP (80), and HTTPS (443) to the internet; denies everything
else inbound. Review the script before running it — it enables `ufw`.

## 5. Create `backend/.env`

```bash
cp backend/.env.example backend/.env
```

Fill in real values. Two things specific to running under Docker Compose:

- **Escape every literal `$` in `ADMIN_PASSWORD_HASH` as `$$`** — see the
  big comment at the top of `.env.example` for why. This is the single
  easiest step to get wrong here; skipping it breaks admin login with no
  error until you actually try to log in.
- Generate a fresh `JWT_SECRET_KEY`: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`
- Set `FRONTEND_URL=https://persepolisconstruction.co.uk` (not localhost —
  this is what password-reset email links get built from).
- `CORS_ORIGINS` already includes `https://persepolisconstruction.co.uk`
  and the `www` variant by default.
- Fill in `SMTP_*` now or later — leaving them blank just means no emails
  send yet, nothing else breaks.

## 6. Get the first TLS certificate

```bash
bash scripts/init-letsencrypt.sh
```

Edit the `domains`/`email` variables at the top of that script first if
they don't match your setup. This starts nginx with a throwaway self-signed
cert just long enough to obtain a real one from Let's Encrypt via the
HTTP-01 challenge, then reloads nginx with it. See the comment at the top of
the script for why this two-step dance is necessary at all.

If it fails partway through, it's safe to just re-run it.

## 7. Bring everything up

```bash
docker compose up -d
```

The `certbot` container keeps running in the background and renews the
certificate automatically (checks every 12h; Let's Encrypt certs are valid
90 days and renew starting ~30 days before expiry).

## 8. Verify

```bash
curl -I https://persepolisconstruction.co.uk/
curl -I https://persepolisconstruction.co.uk/api/health
```

Then check the site and admin panel in a real browser.

## Redeploying after a code change

```bash
git pull
docker compose up -d --build
```

The `backend_data` volume (SQLite db) and `backend/static/uploads` (project
photos) persist across this — nothing gets wiped.

## Logs / troubleshooting

```bash
docker compose logs -f backend
docker compose logs -f nginx
docker compose ps
```

## Backups

Two things are worth backing up periodically:
- The `backend_data` Docker volume (contains `persepolis.db`) — export with
  `docker run --rm -v persepolis-project_backend_data:/data -v $(pwd):/backup alpine tar czf /backup/db-backup.tar.gz -C /data .`
- `backend/static/uploads/` — plain files on disk, back up however you'd
  back up any directory (rsync to another machine, etc.)
