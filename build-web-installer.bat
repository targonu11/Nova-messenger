@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   Nova — сборка для раздачи (установщик)
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Ошибка: нужен Node.js для сборки exe.
  pause
  exit /b 1
)

echo [1/3] Сборка Nova (Electron)...
cd client
call npm install
if errorlevel 1 goto FAIL
call npm run electron:build
if errorlevel 1 goto FAIL
cd ..

set "OUT=%~dp0installer\releases"
if not exist "%OUT%" mkdir "%OUT%"

echo.
echo [2/3] Копирование установщика в installer\releases\...

set "SETUP="
for %%F in ("client\release\Nova Setup*.exe") do set "SETUP=%%~fF"
if not defined SETUP (
  echo Не найден Nova Setup *.exe в client\release\
  goto FAIL
)
copy /Y "%SETUP%" "%OUT%\Nova-Setup-1.1.0.exe" >nul
echo   OK: Nova-Setup-1.1.0.exe

if exist "client\release\win-unpacked" (
  echo.
  echo [3/3] Архив портативной версии...
  powershell -NoProfile -Command ^
    "if (Test-Path '%OUT%\nova-portable-1.1.0.zip') { Remove-Item '%OUT%\nova-portable-1.1.0.zip' -Force }; Compress-Archive -Path 'client\release\win-unpacked\*' -DestinationPath '%OUT%\nova-portable-1.1.0.zip' -Force"
  if errorlevel 1 goto FAIL
  echo   OK: nova-portable-1.1.0.zip
) else (
  echo [3/3] Пропуск zip — нет win-unpacked
)

echo.
echo ========================================
echo   Готово
echo ========================================
echo.
echo Файлы для раздачи:
echo   %OUT%\Nova-Setup-1.1.0.exe
echo   %OUT%\nova-portable-1.1.0.zip
echo.
echo Дальше:
echo   1) Загрузите эти файлы на сервер / Google Drive / GitHub Releases
echo   2) Откройте installer\install-config.json и вставьте прямую ссылку в downloadUrl
echo   3) На другом ПК отправьте папку installer + Install-Nova.bat
echo      (или только Install-Nova.bat + install-config.json + install-nova.ps1)
echo.
echo Без интернета на другом ПК: скопируйте всю папку installer\releases\ вместе с установщиком.
echo.
pause
exit /b 0

:FAIL
echo.
echo Ошибка сборки.
pause
exit /b 1
