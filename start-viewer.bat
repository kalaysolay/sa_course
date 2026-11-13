@echo off
setlocal

cd /d "%~dp0"

set "COURSE_VIEWER_NODE="
where node.exe >nul 2>&1
if not errorlevel 1 set "COURSE_VIEWER_NODE=node.exe"
if defined COURSE_VIEWER_NODE goto run
if exist "%ProgramFiles%\nodejs\node.exe" set "COURSE_VIEWER_NODE=%ProgramFiles%\nodejs\node.exe"
if defined COURSE_VIEWER_NODE goto run
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "COURSE_VIEWER_NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if defined COURSE_VIEWER_NODE goto run
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "COURSE_VIEWER_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if defined COURSE_VIEWER_NODE goto run

echo Node.js was not found.
echo Install Node.js 20 or newer and try again.
pause
exit /b 1

:run
"%COURSE_VIEWER_NODE%" -e "if (Number(process.versions.node.split('.')[0]) < 20) process.exit(1)"
if errorlevel 1 (
  echo Node.js 20 or newer is required.
  pause
  exit /b 1
)

set "COURSE_VIEWER_ROOT=%~1"
if not defined COURSE_VIEWER_ROOT set "COURSE_VIEWER_ROOT=output"

echo Starting Course Viewer for "%COURSE_VIEWER_ROOT%"...
"%COURSE_VIEWER_NODE%" ".\viewer\server.mjs" "%COURSE_VIEWER_ROOT%"

if errorlevel 1 (
  echo.
  echo Course Viewer stopped with an error.
  pause
  exit /b 1
)
