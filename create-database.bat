@echo off
echo ========================================
echo Creating PostgreSQL Database
echo ========================================
echo.
echo This will create the 'rawabi_workshop' database.
echo Make sure PostgreSQL is installed and running.
echo.

set /p PGUSER=Enter PostgreSQL username (default: postgres):
if "%PGUSER%"=="" set PGUSER=postgres

set /p PGPASSWORD=Enter PostgreSQL password:

echo.
echo Creating database...
psql -U %PGUSER% -c "CREATE DATABASE rawabi_workshop;"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Database created successfully!
) else (
    echo.
    echo Database may already exist or there was an error.
)

echo.
pause
