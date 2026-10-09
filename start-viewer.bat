@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found in PATH.
  echo Install Node.js 20 or newer and try again.
  pause
  exit /b 1
)

set "COURSE_VIEWER_ROOT=%~1"
if not defined COURSE_VIEWER_ROOT set "COURSE_VIEWER_ROOT=output"

echo Starting Course Viewer for "%COURSE_VIEWER_ROOT%"...
node ".\viewer\server.mjs" "%COURSE_VIEWER_ROOT%"

if errorlevel 1 (
  echo.
  echo Course Viewer stopped with an error.
  pause
  exit /b 1
)
