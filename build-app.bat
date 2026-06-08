@echo off
chcp 65001 >nul
cd /d "%~dp0client"
echo ========================================
echo   Nova - обновление / сборка приложения
echo ========================================
echo.
echo Установка зависимостей...
call npm install
if errorlevel 1 ( echo Ошибка npm install. & pause & exit /b 1 )
echo.
echo Сборка программы (все последние изменения попадут в exe)...
call npm run electron:build
if errorlevel 1 ( echo Ошибка сборки. & pause & exit /b 1 )
echo.
echo Готово. Обновлённые файлы:
echo   - client\release\Nova Setup 1.1.0.exe
echo   - client\release\win-unpacked\Nova.exe
echo.
pause
