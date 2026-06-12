@echo off
setlocal

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node/npm was not found on PATH.
  echo Install Node 22 or open this from a shell where npm is available.
  pause
  exit /b 1
)

echo Starting LoreKeeper desktop app...
echo.
call npm run desktop

if errorlevel 1 (
  echo.
  echo LoreKeeper exited with an error.
  if /i not "%~1"=="--no-pause" pause
)
