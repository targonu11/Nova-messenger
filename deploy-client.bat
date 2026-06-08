@echo off
chcp 65001 >nul
echo ========================================
echo   Загрузка клиента на сервер
echo ========================================
echo.

if "%1"=="" (
    echo Использование: deploy-client.bat user@server-ip [domain-or-ip]
    echo Пример: deploy-client.bat ubuntu@158.160.123.45
    echo Пример: deploy-client.bat ubuntu@158.160.123.45 mydomain.com
    pause
    exit /b 1
)

set SERVER=%1
set DOMAIN=%2

if "%DOMAIN%"=="" (
    for /f "tokens=2 delims=@" %%a in ("%SERVER%") do set DOMAIN=%%a
)

echo Сервер: %SERVER%
echo Домен/IP: %DOMAIN%
echo.

cd /d "%~dp0client"

echo [1/3] Сборка клиента...
set VITE_API_URL=http://%DOMAIN%
call npm run build
if errorlevel 1 (
    echo ❌ Ошибка сборки клиента
    pause
    exit /b 1
)
echo ✓ Клиент собран
echo.

echo [2/3] Загрузка на сервер...
scp -r dist %SERVER%:~/nova-messenger/client/
if errorlevel 1 (
    echo ❌ Ошибка загрузки файлов
    echo Убедитесь, что:
    echo   1. SSH подключение настроено
    echo   2. Сервер доступен
    echo   3. Путь правильный
    pause
    exit /b 1
)
echo ✓ Файлы загружены
echo.

echo [3/3] Перезагрузка Nginx...
ssh %SERVER% "sudo systemctl reload nginx"
if errorlevel 1 (
    echo ⚠ Не удалось перезагрузить Nginx автоматически
    echo Выполните вручную: ssh %SERVER% "sudo systemctl reload nginx"
) else (
    echo ✓ Nginx перезагружен
)
echo.

echo ========================================
echo   ✓ Клиент загружен!
echo ========================================
echo.
echo Откройте в браузере: http://%DOMAIN%
echo.
pause
