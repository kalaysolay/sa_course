@echo off
setlocal

cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
  echo Python was not found in PATH.
  echo Install Python 3 and try again.
  pause
  exit /b 1
)

echo Starting AnalystGym mockup...
python ".\tasks-mockup\server.py" %*

if errorlevel 1 (
  echo.
  echo Mockup server stopped with an error.
  pause
  exit /b 1
)
