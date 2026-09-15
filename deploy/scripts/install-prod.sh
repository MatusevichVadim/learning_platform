#!/usr/bin/env bash
# Install the app on a VPS (production).
# Run as root or with sudo. Installs Python deps, Node/npm, builds the
# frontend, and enables systemd services for backend + nginx.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_USER="${APP_USER:-learning}"
APP_DIR="${APP_DIR:-/var/www/learning-platform}"
DOMAIN="${DOMAIN:-yourdomain.com}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

echo "[prod] Installing system dependencies..."
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y python3 python3-venv python3-pip nginx git curl
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[prod] Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "[prod] Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

echo "[prod] Preparing app directory: $APP_DIR"
mkdir -p "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  echo "[prod] Cloning repository into $APP_DIR"
  git clone https://github.com/YOUR_ORG/learning-platform.git "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin
git pull origin main

echo "[prod] Creating app user $APP_USER if needed..."
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

echo "[prod] Installing Python dependencies..."
uv venv --system
uv pip install -r backend/requirements.txt --system

echo "[prod] Preparing backend environment..."
if [ ! -f backend/.env ] && [ -f backend/.env.example ]; then
  cp backend/.env.example backend/.env
  echo "[prod] WARNING: edit backend/.env with real secrets before starting!"
fi

echo "[prod] Building frontend..."
cd frontend
npm install
npm run build
cd "$REPO_ROOT"

echo "[prod] Setting ownership..."
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "[prod] Installing systemd units..."
cp deploy/systemd/learning-backend.service /etc/systemd/system/
cp deploy/systemd/learning-frontend.service /etc/systemd/system/ 2>/dev/null || true
sed -i "s|__APP_DIR__|$APP_DIR|g; s|__APP_USER__|$APP_USER|g; s|__BACKEND_PORT__|$BACKEND_PORT|g" /etc/systemd/system/learning-backend.service
systemctl daemon-reload
systemctl enable learning-backend.service

echo "[prod] Installing nginx config..."
cp deploy/nginx/learning-platform.conf /etc/nginx/sites-available/learning-platform.conf
sed -i "s|__DOMAIN__|$DOMAIN|g; s|__APP_DIR__|$APP_DIR|g" /etc/nginx/sites-available/learning-platform.conf
if [ ! -e /etc/nginx/sites-enabled/learning-platform.conf ]; then
  ln -s /etc/nginx/sites-available/learning-platform.conf /etc/nginx/sites-enabled/learning-platform.conf
fi
systemctl restart nginx
systemctl enable nginx

echo "[prod] Done. Start the backend with: systemctl start learning-backend"