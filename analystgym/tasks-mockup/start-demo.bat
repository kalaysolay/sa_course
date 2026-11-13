@echo off
setlocal
cd /d "%~dp0"
set "AG_NODE="
where node.exe >nul 2>&1
if not errorlevel 1 set "AG_NODE=node.exe"
if defined AG_NODE goto run
if exist "%ProgramFiles%\nodejs\node.exe" set "AG_NODE=%ProgramFiles%\nodejs\node.exe"
if defined AG_NODE goto run
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "AG_NODE=%ProgramFiles(x86)%\nodejs\node.exe"
if defined AG_NODE goto run
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "AG_NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if defined AG_NODE goto run
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "AG_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if defined AG_NODE goto run
where powershell.exe >nul 2>&1 && goto run_ps
echo Node.js and PowerShell were not found. Install Node.js or open course.html directly.
pause
exit /b 1
:run
echo Open http://127.0.0.1:5180/courses.html in your browser.
"%AG_NODE%" serve.mjs
pause
endlocal
:run_ps
echo Open http://127.0.0.1:5180/courses.html in your browser.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "serve.ps1"
pause
endlocal
