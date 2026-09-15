# Deploy the Learning Platform

This project can run in two modes:

- **Local development** — backend (FastAPI) + Vite dev server on your machine.
- **Production (VPS)** — backend runs as a systemd service, the frontend is
  built into static files and served by nginx.

The two modes are completely separate: they use different database files,
different ports/origins and different environment variables.

## Local development

### One command (Windows)

Double-click `start.bat` in the repo root. It installs dependencies and starts
the backend (`http://127.0.0.1:8000`) and the frontend dev server
(`http://localhost:5173`) in two separate windows.

### Manual (Linux / macOS)

```bash
./deploy/scripts/start-dev.sh
```

### Environment

Copy `backend/.env.example` to `backend/.env` and fill in real values:

```bash
cp backend/.env.example backend/.env
```

Required secrets (fail-closed if missing):

- `APP_SECRET_KEY` — JWT signing key (generate with `python -c "import secrets; print(secrets.token_hex(32))"`).
- `ADMIN_PASSWORD` — password for the default admin account.

Other useful overrides:

- `DB_PATH` — sqlite file path (defaults to `backend_data.sqlite3` next to the code).
- `ALLOWED_ORIGINS` — comma separated CORS list.
- `ACCESS_TOKEN_EXPIRE_MINUTES` — token lifetime (default 10080 = 7 days).
- `SECURE_COOKIES` — set to `true` when serving over HTTPS.

The frontend dev server proxies `/api` and `/uploads` to the backend, so the
browser talks to `http://localhost:5173` only.

## Production (VPS)

### 1. Install

SSH into the VPS and run the install script (as root or with `sudo`):

```bash
git clone <repo-url> /var/www/learning-platform
cd /var/www/learning-platform
sudo bash deploy/scripts/install-prod.sh
```

The script installs Python, Node.js, uv, nginx, builds the frontend and
enables the backend systemd service. Edit the variables at the top of the
script if you want a different path / domain.

### 2. Configure secrets

```bash
sudo -u learning bash
cd /var/www/learning-platform
cp backend/.env.example backend/.env
# edit backend/.env with real values (APP_SECRET_KEY, ADMIN_PASSWORD, etc.)
```

Set `SECURE_COOKIES=true` and `ALLOWED_ORIGINS=https://taskgym.com` once
the site is reachable over HTTPS.

### 3. Start / restart services

```bash
sudo systemctl start learning-backend
sudo systemctl restart nginx
```

Check status:

```bash
sudo systemctl status learning-backend
sudo systemctl status nginx
```

### 4. HTTPS (optional but recommended)

Use Certbot to get a free certificate:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Then edit `deploy/nginx/learning-platform.conf` to enable the HTTPS block and
set `SECURE_COOKIES=true` in `backend/.env`.

## How the pieces fit together

```
Browser  ── HTTPS ──>  nginx (port 80/443)
                              │
                              ├─ /api      ──>  backend:8000 (127.0.0.1)
                              ├─ /uploads  ──>  backend:8000
                              └─ /         ──>  frontend/dist (static files)
```

- The backend is a systemd service (`deploy/systemd/learning-backend.service`)
  listening on `127.0.0.1:8000`. It reads its config from
  `backend/.env` (see `EnvironmentFile` in the unit).
- nginx proxies `/api` and `/uploads` to the backend and serves the built
  frontend from `frontend/dist` (`deploy/nginx/learning-platform.conf`).
- The frontend build reads `VITE_API_BASE` from a `.env.production` file
  (Vite convention). For a same-domain deploy you can leave it empty so the
  browser uses relative `/api` paths.

## Rebuilding after changes

```bash
# On the VPS
cd /var/www/learning-platform
git pull origin main
cd frontend
npm run build
sudo systemctl restart nginx
sudo systemctl restart learning-backend