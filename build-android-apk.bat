@echo off
chcp 65001 >nul
echo ========================================
echo   Сборка APK для Android - Nova
echo ========================================
echo.

cd /d "%~dp0client"

echo [1/4] Проверка зависимостей...
if not exist "node_modules" (
    echo Установка зависимостей...
    call npm install
    if errorlevel 1 (
        echo ❌ Ошибка установки зависимостей
        pause
        exit /b 1
    )
) else (
    echo ✓ Зависимости уже установлены
)

echo.
echo [2/4] Сборка веб-версии...
call npm run build
if errorlevel 1 (
    echo ❌ Ошибка сборки веб-версии
    pause
    exit /b 1
)
echo ✓ Веб-версия собрана

echo.
echo [3/4] Синхронизация с Android проектом...
if not exist "android" (
    echo Инициализация Android проекта...
    call npx cap add android
    if errorlevel 1 (
        echo ❌ Ошибка инициализации Android проекта
        echo Убедитесь, что установлены:
        echo   - Java JDK 17+
        echo   - Android Studio
        echo   - Android SDK
        pause
        exit /b 1
    )
)

call npx cap sync android
if errorlevel 1 (
    echo ❌ Ошибка синхронизации
    pause
    exit /b 1
)
echo ✓ Синхронизация завершена

echo.
echo [4/4] Сборка APK...
cd android
if exist "gradlew.bat" (
    call gradlew.bat assembleDebug
    if errorlevel 1 (
        echo ❌ Ошибка сборки APK
        echo.
        echo Попробуйте собрать через Android Studio:
        echo   1. Запустите: npx cap open android
        echo   2. В Android Studio: Build ^> Build Bundle(s) / APK(s) ^> Build APK(s)
        cd ..
        pause
        exit /b 1
    )
    
    echo.
    echo ========================================
    echo   ✓ APK успешно собран!
    echo ========================================
    echo.
    echo APK файл находится в:
    echo   client\android\app\build\outputs\apk\debug\app-debug.apk
    echo.
    echo Вы можете установить его на Android устройство или эмулятор.
    echo.
) else (
    echo ⚠ gradlew.bat не найден
    echo Откройте проект в Android Studio:
    echo   npx cap open android
    echo.
    echo Затем соберите APK через Android Studio:
    echo   Build ^> Build Bundle(s) / APK(s) ^> Build APK(s)
)

cd ..
pause
