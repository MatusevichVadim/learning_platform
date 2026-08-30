@echo off
echo Starting backend and frontend...

@REM REM Check for updates from GitHub
@REM echo Checking for updates from GitHub...
@REM git fetch origin

@REM REM Get current branch name
@REM for /f %%i in ('git rev-parse --abbrev-ref HEAD') do set branch=%%i

@REM REM Check if there are remote changes
@REM git status origin/%branch% >nul 2>&1
@REM if %errorlevel% equ 0 (
@REM     echo Found updates, pulling latest changes...
@REM     git pull origin %branch%
@REM     echo.
@REM     echo Updates downloaded! Please restart the application.
@REM     echo.
@REM )

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
