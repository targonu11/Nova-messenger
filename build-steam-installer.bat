@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   Nova — красивый установщик (Steam)
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Нужен Node.js.
  pause
  exit /b 1
)

echo [1/4] Сборка Nova (приложение)...
cd client
if not exist node_modules call npm install
call npm run electron:build
if errorlevel 1 goto FAIL
cd ..

set "REL=%~dp0installer\releases"
if not exist "%REL%" mkdir "%REL%"

echo.
echo [2/4] Копирование Nova-Setup в releases...
set "SETUP="
for %%F in ("client\release\Nova Setup*.exe") do set "SETUP=%%~fF"
if not defined SETUP goto FAIL
copy /Y "%SETUP%" "%REL%\Nova-Setup-1.1.0.exe" >nul

if not exist "%~dp0installer-ui\bundled" mkdir "%~dp0installer-ui\bundled"
copy /Y "%REL%\Nova-Setup-1.1.0.exe" "%~dp0installer-ui\bundled\Nova-Setup-1.1.0.exe" >nul
echo   Встроено в установщик: installer-ui\bundled\

echo.
echo [3/4] Синхронизация config...
powershell -NoProfile -Command ^
  "$c = Get-Content '%~dp0installer\install-config.json' -Raw -Encoding UTF8 | ConvertFrom-Json; ^
   $out = @{ version=$c.version; mode=$c.mode; downloadUrl=$c.downloadUrl; portableZipUrl=$c.portableZipUrl; setupFileName=$c.setupFileName; portableZipFileName=$c.portableZipFileName; installDir=$c.installDir; createDesktopShortcut=$c.createDesktopShortcut; runAfterInstall=$c.runAfterInstall; silentSetup=$c.silentSetup }; ^
   $out | ConvertTo-Json | Set-Content '%~dp0installer-ui\config.json' -Encoding UTF8"

echo.
echo [4/4] Сборка графического установщика...
cd installer-ui
if not exist node_modules call npm install
call npm run build
if errorlevel 1 goto FAIL
cd ..

echo.
echo ========================================
echo   Готово
echo ========================================
echo.
echo Раздайте на другие ПК:
echo   installer\releases\Nova-Installer.exe
echo.
echo Двойной клик — откроется установщик в стиле Steam.
echo Если exe встроен в пакет — интернет не нужен.
echo.
pause
exit /b 0

:FAIL
echo Ошибка сборки.
pause
exit /b 1
