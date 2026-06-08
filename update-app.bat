@echo off
chcp 65001 >nul
cd /d "%~dp0client"
echo ========================================
echo   Nova - пересборка (изменения в exe)
echo ========================================
echo.
echo Сборка... Все новые изменения попадут в приложение.
call npm run electron:build
if errorlevel 1 ( echo Ошибка сборки. Запустите build-app.bat для полной установки. & pause & exit /b 1 )
echo.
echo Готово. Запускайте client\release\win-unpacked\Nova.exe
echo.
pause
