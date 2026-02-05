@echo off
echo Starting backend and frontend...

REM Install backend dependencies if needed
echo Installing backend dependencies...
uv pip install -r backend/requirements.txt --system

REM Install frontend dependencies if needed
echo Installing frontend dependencies...
cd frontend
if not exist node_modules call npm install
cd ..

REM Start backend
start "Backend" cmd /k "uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000"

REM Start frontend
start "Frontend" cmd /k "cd frontend && npm run dev"

echo Both services are starting in separate windows.
