@echo off
setlocal
cd /d "%~dp0"

rem ---------------------------------------------------------------
rem  ClassSoftwareHub desktop app - Windows launcher
rem  Double-click this file to run the app straight from source.
rem  (No build step needed: the app remote-loads the live site.)
rem ---------------------------------------------------------------

rem Some sandboxed shells preset this; it would make Electron behave
rem like plain Node and exit immediately. Clear it.
set "ELECTRON_RUN_AS_NODE="

set "ELECTRON=%~dp0node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON%" (
    echo.
    echo  [!] Electron is not installed in this folder yet.
    echo      Open a terminal here and run:  npm install
    echo      ^(first run pulls about 100 MB, be patient^)
    echo.
    pause
    exit /b 1
)

echo Starting ClassSoftwareHub desktop app...
rem "%~dp0" ends with a backslash; inside quotes that last \" would be read as an
rem escaped quote and corrupt the path. "%~dp0." keeps it a plain directory path.
start "" "%ELECTRON%" "%~dp0."
