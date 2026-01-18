@echo off
echo ========================================
echo Al Rawabi Workshop App - Starting...
echo ========================================
echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:5000
echo.
echo Press Ctrl+C to stop the servers
echo ========================================
echo.

cd /d "%~dp0"

:: Start backend server in new window
start "Rawabi Backend" cmd /k "cd server && npm run dev"

:: Wait a moment for backend to start
timeout /t 3 /nobreak > nul

:: Start frontend server in new window
start "Rawabi Frontend" cmd /k "cd client && npm run dev"

:: Open browser after a short delay
timeout /t 5 /nobreak > nul
start http://localhost:5173

echo.
echo Servers started in separate windows.
echo Close this window or press any key to exit.
pause > nul
