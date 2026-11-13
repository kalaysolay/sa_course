@echo off
setlocal
cd /d "%~dp0"

rem --- Parse --port (used by the Node.js and PowerShell runtimes) ---
set "AG_PORT="
:parse_port
if "%~1"=="" goto parsed_port
if /i "%~1"=="--port" goto take_port
set "AG_ARG=%~1"
if /i "%AG_ARG:~0,7%"=="--port=" goto take_port_eq
shift
goto parse_port

:take_port
set "AG_PORT=%~2"
shift
shift
goto parse_port

:take_port_eq
set "AG_PORT=%AG_ARG:~7%"
shift
goto parse_port

:parsed_port

rem --- Pick a runtime: real Python first, then Node.js, then PowerShell ---
rem The "python" alias from the Microsoft Store is not Python, so we probe it
rem by running it instead of checking whether the file exists.
set "AG_PY="
call :probe_python "py -3"
if not defined AG_PY call :probe_python "python"
if not defined AG_PY call :probe_python "python3"

if defined AG_PY goto run_python

set "AG_NODE="
where node.exe >nul 2>&1 && set "AG_NODE=node.exe"
if not defined AG_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "AG_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined AG_NODE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "AG_NODE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined AG_NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "AG_NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined AG_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "AG_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if defined AG_NODE goto run_node

where powershell.exe >nul 2>&1 && goto run_powershell

echo.
echo No runtime found: Python, Node.js and PowerShell are all unavailable.
echo Install Python 3 (https://www.python.org/downloads/windows/) or Node.js and try again.
pause
exit /b 1

:run_python
echo Starting AnalystGym mockup ^(runtime: %AG_PY%^)...
echo Open http://127.0.0.1:5180 in your browser.
%AG_PY% ".\tasks-mockup\server.py" %*
goto done

:run_node
echo Starting AnalystGym mockup ^(runtime: %AG_NODE%^)...
echo Open http://127.0.0.1:5180/courses.html in your browser.
if defined AG_PORT set "PORT=%AG_PORT%"
"%AG_NODE%" ".\tasks-mockup\serve.mjs"
goto done

:run_powershell
echo Starting AnalystGym mockup ^(runtime: powershell.exe^)...
echo Open http://127.0.0.1:5180 in your browser.
if defined AG_PORT set "PORT=%AG_PORT%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tasks-mockup\serve.ps1" %*
if errorlevel 2 goto port_busy
if errorlevel 1 goto failed
goto done

:port_busy
echo.
echo The mockup was not started: the port is already taken.
pause
exit /b 1

:failed
echo.
echo The mockup server stopped with an error.
pause
exit /b 1

:done
echo.
echo Mockup server stopped.
pause
endlocal

rem Probe a Python launcher: succeeds only for a working interpreter.
:probe_python
%~1 -c "import sys" >nul 2>&1
if errorlevel 1 exit /b 0
set "AG_PY=%~1"
exit /b 0
