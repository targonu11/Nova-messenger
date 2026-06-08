@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   Nova - приложение (Electron)
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Ошибка: Node.js не найден.
  pause
  exit /b 1
)

if not exist "server\node_modules" (
  echo Устанавливаю зависимости сервера...
  call npm install --prefix server
  echo.
)
if not exist "client\node_modules" (
  echo Устанавливаю зависимости клиента...
  call npm install --prefix client
  echo.
)

:: Сервер в отдельном окне (свернуто)
start "Nova Server" /min cmd /c "cd /d %~dp0server && node index.js"
timeout /t 2 /nobreak >nul

set "EXE=%~dp0client\release\win-unpacked\Nova.exe"
if exist "%EXE%" (
  echo Запуск приложения...
  start "" "%EXE%"
  echo Готово. Окно сервера можно свернуть.
  echo.
  echo Веб в браузере: start-all.bat ^(http://localhost:5173^)
) else (
  echo Exe не собран. Запуск веб-клиента + Electron...
  echo Открой в браузере: http://localhost:5173
  start /b cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:5173"
  cd client
  call npm run electron:dev
  cd ..
)
pause
