@echo off
chcp 65001 >nul
title Svidanie - local server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js not found. Install it from https://nodejs.org and run again.
  echo.
  pause
  exit /b 1
)
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3333/admin"
node server.js
pause
