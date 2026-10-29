@echo off
title Battle of the Boards
cd /d "%~dp0"
echo.
echo   BATTLE OF THE BOARDS
echo   Starting the local game server...
echo.

where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8080
  node server.js 8080
  goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8080
  python -m http.server 8080 --bind 127.0.0.1
  goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8080
  py -m http.server 8080 --bind 127.0.0.1
  goto :eof
)

echo   Neither Node.js nor Python was found.
echo   Install Node.js LTS from https://nodejs.org and run this file again.
pause
