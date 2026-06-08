@echo off
chcp 65001 >nul

cd /d "%~dp0"
set "ROOT=%~dp0"

rem Mode:
rem   all (default)     = PC (electron:dev) + Android sync/open
rem   pc                = PC only (electron:dev + server)
rem   web               = Web only (server + vite web via launcher.js)
rem   android           = Android sync/open (no APK build)
rem   android-apk      = Build Android debug APK
rem   ios               = iOS sync/open (requires Xcode/macOS)

set "MODE=%~1"
if "%MODE%"=="" set "MODE=all"

where node >nul 2>&1
if errorlevel 1 (
  echo Ошибка: Node.js не найден. Установите Node.js и добавьте в PATH.
  pause
  exit /b 1
)

rem ----------------------------
rem Dependencies
rem ----------------------------
if not exist "%ROOT%server\node_modules" (
  echo Устанавливаю зависимости сервера...
  call npm install --prefix server
  if errorlevel 1 ( echo Ошибка npm install server. & pause & exit /b 1 )
)

if not exist "%ROOT%client\node_modules" (
  echo Устанавливаю зависимости клиента...
  call npm install --prefix client
  if errorlevel 1 ( echo Ошибка npm install client. & pause & exit /b 1 )
)

echo.
echo ========================================
echo   Nova - старт всех компонентов
echo   Mode: %MODE%
echo ========================================
echo.

if /i "%MODE%"=="web" goto WEB_ONLY

rem ----------------------------
rem Start server (needed for pc/android)
rem ----------------------------
echo Запускаю сервер (localhost:3001)...
start "Nova Server" /min cmd /c "cd /d \"%ROOT%server\" && node index.js"
timeout /t 2 /nobreak >nul

if /i "%MODE%"=="pc" goto PC_ONLY
if /i "%MODE%"=="android" goto ANDROID_ONLY
if /i "%MODE%"=="android-apk" goto ANDROID_APK_ONLY
if /i "%MODE%"=="ios" goto IOS_ONLY

rem all (default): pc + android
goto PC_AND_ANDROID

rem ----------------------------
:WEB_ONLY
echo Запускаю server + web client (5173)...
node "%ROOT%launcher.js"
exit /b 0

rem ----------------------------
:PC_ONLY
echo Запускаю PC (Electron dev)...
start "Nova Electron Dev" cmd /k "cd /d \"%ROOT%client\" && npm run electron:dev"
pause
exit /b 0

rem ----------------------------
:PC_AND_ANDROID
echo Запускаю PC (Electron dev)...
start "Nova Electron Dev" cmd /k "cd /d \"%ROOT%client\" && npm run electron:dev"

rem wait a bit for vite port readiness (best-effort)
timeout /t 4 /nobreak >nul

echo.
echo Готовлю Android (sync/open)...
cd /d "%ROOT%client"
call npm run build
if errorlevel 1 ( echo Ошибка build клиента. & pause & exit /b 1 )

if not exist "android" (
  echo Инициализирую Android проект (cap add android)...
  call npx cap add android
  if errorlevel 1 ( echo Ошибка cap add android. & pause & exit /b 1 )
)

call npx cap sync android
if errorlevel 1 ( echo Ошибка cap sync android. & pause & exit /b 1 )

call npx cap open android
if errorlevel 1 ( echo Ошибка cap open android. & pause & exit /b 1 )

echo.
echo Готово. Оставил запущенными:
echo   - Сервер: http://localhost:3001
echo   - Electron dev (в отдельном окне)
echo   - Android Studio (если открылась)
echo.
pause
exit /b 0

rem ----------------------------
:ANDROID_ONLY
echo Запускаю Android (sync/open)...
cd /d "%ROOT%client"
call npm run build
if errorlevel 1 ( echo Ошибка build клиента. & pause & exit /b 1 )

if not exist "android" (
  echo Инициализирую Android проект (cap add android)...
  call npx cap add android
  if errorlevel 1 ( echo Ошибка cap add android. & pause & exit /b 1 )
)

call npx cap sync android
if errorlevel 1 ( echo Ошибка cap sync android. & pause & exit /b 1 )

call npx cap open android
if errorlevel 1 ( echo Ошибка cap open android. & pause & exit /b 1 )

pause
exit /b 0

rem ----------------------------
:ANDROID_APK_ONLY
echo Сборка Android debug APK...
cd /d "%ROOT%client"
call npm run build
if errorlevel 1 ( echo Ошибка build клиента. & pause & exit /b 1 )

if not exist "android" (
  echo Инициализирую Android проект (cap add android)...
  call npx cap add android
  if errorlevel 1 ( echo Ошибка cap add android. & pause & exit /b 1 )
)

call npx cap sync android
if errorlevel 1 ( echo Ошибка cap sync android. & pause & exit /b 1 )

cd android
call gradlew assembleDebug
if errorlevel 1 ( echo Ошибка сборки APK (gradlew assembleDebug). & pause & exit /b 1 )

echo.
echo APK собран:
echo   client\android\app\build\outputs\apk\debug\app-debug.apk
echo.
pause
exit /b 0

rem ----------------------------
:IOS_ONLY
echo iOS режим требует macOS/Xcode.
echo Запускаю cap sync/open ios...
cd /d "%ROOT%client"
call npm run build
if errorlevel 1 ( echo Ошибка build клиента. & pause & exit /b 1 )

call npx cap sync ios
if errorlevel 1 ( echo Ошибка cap sync ios. & pause & exit /b 1 )

call npx cap open ios
if errorlevel 1 ( echo Ошибка cap open ios. & pause & exit /b 1 )

pause
exit /b 0

