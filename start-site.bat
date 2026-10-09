@echo off
rem Starts the APEX site on this computer. Keep this window open while you use the site.
cd /d "%~dp0"
echo Starting the APEX site at http://localhost:5173 ...
echo Close this window to turn the site off.
call npm run dev -- --port 5173 --strictPort
pause
