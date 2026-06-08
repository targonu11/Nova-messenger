@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "DIST=%~dp0installer\Nova-Installer-Pack"
if exist "%DIST%" rmdir /s /q "%DIST%"
mkdir "%DIST%"
mkdir "%DIST%\installer"
mkdir "%DIST%\installer\releases" 2>nul

copy /Y "%~dp0Install-Nova.bat" "%DIST%\" >nul
copy /Y "%~dp0installer\install-nova.ps1" "%DIST%\installer\" >nul
copy /Y "%~dp0installer\install-config.json" "%DIST%\installer\" >nul

if exist "%~dp0installer\releases\Nova-Setup-1.1.0.exe" (
  copy /Y "%~dp0installer\releases\Nova-Setup-1.1.0.exe" "%DIST%\installer\releases\" >nul
  echo Добавлен локальный Nova-Setup (установка без интернета).
)

set "ZIP=%~dp0installer\Nova-Installer-Pack.zip"
powershell -NoProfile -Command "Compress-Archive -Path '%DIST%\*' -DestinationPath '%ZIP%' -Force"

echo.
echo Пакет для отправки на другой ПК:
echo   %ZIP%
echo.
echo Распакуйте на другом ПК и запустите Install-Nova.bat
echo.
pause
