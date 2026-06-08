@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   Nova - сервер и веб-клиент
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Ошибка: Node.js не найден. Установите Node.js и добавьте в PATH.
  pause
  exit /b 1
)

if not exist "server\node_modules" (
  echo Устанавливаю зависимости сервера...
  call npm install --prefix server
  if errorlevel 1 ( echo Ошибка. & pause & exit /b 1 )
  echo.
)
if not exist "client\node_modules" (
  echo Устанавливаю зависимости клиента...
  call npm install --prefix client
  if errorlevel 1 ( echo Ошибка. & pause & exit /b 1 )
  echo.
)

echo Запускаю сервер и веб-клиент...
echo Сервер: http://localhost:3001   Веб: http://localhost:5173
echo Остановка: Ctrl+C
echo.
start /b cmd /c "timeout /t 6 /nobreak >nul && start http://localhost:5173"
node launcher.js
pause
