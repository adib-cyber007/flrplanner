@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js 22.12 or newer, then run this file again.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js with npm included.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing project dependencies...
  call npm install
  if errorlevel 1 goto :failed
)

echo.
echo Starting Forma...
echo Open the Local address that Vite prints below in your browser.
echo Press Ctrl+C to stop the local servers.
echo.

call npm run dev
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo Forma could not start. Review the error above.
pause
exit /b 1
