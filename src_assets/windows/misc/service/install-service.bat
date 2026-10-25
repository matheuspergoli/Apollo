@echo off
setlocal
for %%I in ("%~dp0\..") do set "ROOT_DIR=%%~fI"
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0update-installation.ps1" -InstallDir "%ROOT_DIR%" -Mode Service
exit /b %ERRORLEVEL%
