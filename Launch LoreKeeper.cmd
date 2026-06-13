@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node was not found on PATH.
  echo Install Node 22 or open this from a shell where node is available.
  pause
  exit /b 1
)

echo Starting LoreKeeper desktop app...
echo.
node ".\scripts\launch-desktop.js"

if errorlevel 1 (
  echo.
  echo LoreKeeper exited with an error.
  if /i not "%~1"=="--no-pause" pause
)
