@echo off
echo ========================================
echo Al Rawabi Workshop App - Initial Setup
echo ========================================
echo.

echo [1/3] Installing dependencies...
cd /d "%~dp0"
call npm install
cd client
call npm install
cd ../server
call npm install
cd ..

echo.
echo [2/3] Initializing database...
echo Make sure PostgreSQL is running and database 'rawabi_workshop' exists!
echo.
pause

cd server
call npm run db:init

echo.
echo [3/3] Seeding questions from documents...
call npm run db:seed
cd ..

echo.
echo ========================================
echo Setup complete!
echo Run 'start.bat' to launch the application
echo ========================================
pause
