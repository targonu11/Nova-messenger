# Сборка Android (APK/AAB)

## Требования

1. **Node.js** (уже установлен)
2. **Java JDK 17 или выше** - скачайте с https://adoptium.net/
3. **Android Studio** - скачайте с https://developer.android.com/studio
4. **Android SDK** - устанавливается через Android Studio

## Установка зависимостей

```bash
cd client
npm install
```

## Первоначальная настройка (один раз)

1. Установите Android Studio и откройте его
2. В Android Studio: **Tools → SDK Manager**
3. Установите:
   - Android SDK Platform 33 или выше
   - Android SDK Build-Tools
   - Android SDK Command-line Tools

4. Настройте переменные окружения (Windows):
   - `ANDROID_HOME` = `C:\Users\ВашеИмя\AppData\Local\Android\Sdk`
   - Добавьте в PATH: `%ANDROID_HOME%\platform-tools` и `%ANDROID_HOME%\tools`

5. Инициализируйте Android проект:
```bash
cd client
npm run build
npx cap add android
npx cap sync android
```

## Сборка APK

### Debug APK (для тестирования)

```bash
cd client
npm run android:build
cd android
./gradlew assembleDebug
```

APK будет в: `client/android/app/build/outputs/apk/debug/app-debug.apk`

### Release APK (для распространения)

1. Создайте keystore (один раз):
```bash
cd client/android/app
keytool -genkey -v -keystore nova-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias nova
```

2. Создайте файл `client/android/key.properties`:
```
storePassword=ваш_пароль
keyPassword=ваш_пароль
keyAlias=nova
storeFile=../app/nova-release-key.jks
```

3. Обновите `client/android/app/build.gradle` (см. инструкцию ниже)

4. Соберите Release APK:
```bash
cd client
npm run android:release
```

APK будет в: `client/android/app/build/outputs/apk/release/app-release.apk`

### AAB (apkх для Google Play)
Если вы имели в виду “apkх” как формат для публикации в Google Play, то это обычно **Android App Bundle (AAB)**.

Команды такие же, как и для `Release APK` (требуется release-подпись keystore).

Сборка AAB:
```bash
cd client
npm run android:aab
```

AAB будет в: `client/android/app/build/outputs/bundle/release/app-release.aab`

### Сразу обе версии (APK + AAB)
```bash
cd client
npm run android:both
```

## Альтернативный способ через Android Studio

1. Соберите веб-версию:
```bash
cd client
npm run build
npx cap sync android
```

2. Откройте Android Studio:
```bash
npx cap open android
```

3. В Android Studio:
   - **Build → Build Bundle(s) / APK(s) → Build APK(s)**
   - Или **Build → Generate Signed Bundle / APK**

## Настройка для работы с сервером

### Для эмулятора Android
По умолчанию приложение будет пытаться подключиться к `http://localhost:3001` или `http://10.0.2.2:3001` (специальный адрес для эмулятора).

### Для реального Android устройства
Для работы с реальным устройством нужно указать IP адрес компьютера, на котором запущен сервер:

1. **Узнайте IP адрес вашего компьютера:**
   - Windows: `ipconfig` (IPv4 адрес)
   - Linux/Mac: `ifconfig` или `ip addr`

2. **Соберите приложение с указанием IP:**
   ```bash
   cd client
   VITE_API_URL=http://192.168.1.10:3001 npm run build
   npx cap sync android
   ```

   Или измените в коде `client/src/api.js` и `client/src/SocketContext.jsx`:
   - Замените `http://localhost:3001` на `http://ВАШ_IP:3001`

3. **Убедитесь, что сервер доступен по сети:**
   - В `server/index.js` убедитесь, что сервер слушает на `0.0.0.0`, а не только `localhost`
   - Проверьте файрвол - порт 3001 должен быть открыт

### Использование переменной окружения VITE_API_URL
Можно задать URL сервера через переменную окружения при сборке:
```bash
VITE_API_URL=http://192.168.1.10:3001 npm run build
```

## Разрешения Android

Приложение требует следующие разрешения (настроены автоматически при `npx cap add android`):
- Интернет (`INTERNET`)
- Камера (`CAMERA`) - для аватаров
- Микрофон (`RECORD_AUDIO`) - для голосовых сообщений и звонков
- Уведомления (`POST_NOTIFICATIONS`) - для уведомлений о сообщениях

Эти разрешения автоматически добавляются в `android/app/src/main/AndroidManifest.xml`.

## Быстрая сборка через скрипт

Используйте готовый скрипт для Windows:
```bash
build-android-apk.bat
```

Этот скрипт автоматически:
1. Установит зависимости (если нужно)
2. Соберёт веб-версию
3. Синхронизирует с Android проектом
4. Соберёт Debug APK

APK будет в: `client/android/app/build/outputs/apk/debug/app-debug.apk`
