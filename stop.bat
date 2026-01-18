@echo off
echo Stopping Al Rawabi Workshop App servers...
taskkill /FI "WINDOWTITLE eq Rawabi Backend*" /F 2>nul
taskkill /FI "WINDOWTITLE eq Rawabi Frontend*" /F 2>nul
echo Servers stopped.
pause
