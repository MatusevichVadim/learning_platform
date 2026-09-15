#!/usr/bin/env bash
# Start the app locally for development (backend + frontend dev server).
# Usage: ./deploy/scripts/start-dev.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

echo "[dev] Installing backend dependencies..."
uv pip install -r backend/requirements.txt --system

echo "[dev] Installing frontend dependencies..."
cd frontend
if [ ! -d node_modules ]; then
  npm install
fi
cd "$REPO_ROOT"

# Ensure backend/.env exists (copy from example if missing).
if [ ! -f backend/.env ] && [ -f backend/.env.example ]; then
  echo "[dev] backend/.env not found - copying from backend/.env.example"
  cp backend/.env.example backend/.env
fi

echo "[dev] Starting backend on http://127.0.0.1:8000"
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

echo "[dev] Starting frontend dev server on http://localhost:5173"
cd frontend
npm run dev &
FRONTEND_PID=$!
cd "$REPO_ROOT"

echo "[dev] Backend PID=$BACKEND_PID  Frontend PID=$FRONTEND_PID"
echo "[dev] Press Ctrl+C to stop both."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait