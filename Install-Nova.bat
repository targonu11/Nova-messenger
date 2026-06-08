@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "GUI=%~dp0installer\releases\Nova-Installer.exe"
if exist "%GUI%" (
  start "" "%GUI%"
  exit /b 0
)

echo ========================================
echo   Nova — установка на этот ПК
echo ========================================
echo.
echo Графический установщик не найден. Запускаю скрипт...
echo Соберите: build-steam-installer.bat
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\install-nova.ps1"
set "ERR=%ERRORLEVEL%"
echo.
if not "%ERR%"=="0" pause
exit /b %ERR%
