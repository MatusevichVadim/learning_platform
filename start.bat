@echo off
setlocal enabledelayedexpansion

echo Starting Learning Platform in DEV mode...

REM Ensure backend/.env exists (copy from example if missing).
if not exist backend\.env (
    if exist backend\.env.example (
        echo [dev] backend/.env not found - copying from backend/.env.example
        copy backend\.env.example backend\.env
    )
)

REM Install backend dependencies if needed
echo [dev] Installing backend dependencies...
uv pip install -r backend/requirements.txt --system

REM Install frontend dependencies if needed
echo [dev] Installing frontend dependencies...
cd frontend
if not exist node_modules call npm install
cd ..

REM Start backend
start "Backend" cmd /k "uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000"

REM Start frontend
start "Frontend" cmd /k "cd frontend && npm run dev"

echo Both services are starting in separate windows.
echo   Backend:  http://127.0.0.1:8000
echo   Frontend: http://localhost:5173
