# Nova

A **Telegram/Discord-style** messenger with **20 pre-created accounts**, groups, private and group calls, and avatars. Available as:

- **Web app** (browser)
- **PC program** (Windows/macOS/Linux via Electron)
- **Phone app** (Android and iOS via Capacitor)

## Design

- **Dark theme** similar to Telegram and Discord
- **Chat list** in a sidebar (desktop) or slide-out menu (mobile)
- **Message bubbles**: blue for your messages, gray for others
- **Rounded UI**, clear typography, responsive layout

## Features

- **20 pre-created accounts** with random passwords (check server console on startup)
- **Login/password authentication**
- **Avatars**: set a profile picture (visible to everyone)
- **Direct messages** and **groups**
- **Private** and **group** voice/video calls (WebRTC)
- Works in **browser**, as **desktop app**, and as **mobile app**

---

## Один клик — запуск всего

**Дважды щёлкни по `start-all.bat`** в папке проекта. Откроется **одно окно терминала**, в нём одновременно запустятся сервер и клиент, и откроется браузер на http://localhost:5173. Остановка — **Ctrl+C** в этом окне.

Первый раз батник сам выполнит `npm install` в корне (для утилиты запуска). Отдельно один раз установи зависимости: в папке **server** выполни `npm install`, в папке **client** — `npm install`.

---

## Полные команды для запуска (копируй и вставляй)

Путь к проекту на этом ПК: `C:\Users\roman\Downloads\ьфч`

**Терминал 1 — сервер (оставь открытым):**

В PowerShell используйте `npm.cmd` (если пишет «выполнение сценариев отключено»):

```powershell
cd "C:\Users\roman\Downloads\ьфч\server"
npm.cmd install
npm.cmd start
```

**Терминал 2 — клиент (веб-приложение):**

```powershell
cd "C:\Users\roman\Downloads\ьфч\client"
npm.cmd install
npm.cmd run dev
```

**PC-программа (после сборки):** дважды щёлкни **`start-nova.bat`** в корне проекта — сервер и `Nova.exe` запустятся вместе.

После запуска открой в браузере **http://localhost:5173**. Логины и пароли появятся в консоли сервера (Терминал 1).

---

## 1. Run the server (required for all versions)

### Option A: Node.js Server (Original)

```bash
cd server
npm install
npm start
```

### Option B: C++ Server (High Performance)

```bash
cd server-cpp
mkdir build && cd build
cmake ..
cmake --build .
./game_messenger_server_cpp
```

See [server-cpp/README.md](server-cpp/README.md) for detailed build instructions.

Server runs at **http://localhost:3001**. On first start it creates the database and seeds 20 accounts with random passwords. **Check the server console** to see login credentials. After changing server code (e.g. adding routes), restart the server so new routes (like `POST /api/voice/upload`) are active.

**Голосовые сообщения:** работают только с **Node.js сервером** (Option A). Если запущен C++ сервер (Option B), при отправке голосового появится ошибка — переключитесь на `cd server && npm start`.

**Где хранятся группы и чаты:** в файле **server/messenger.db**. Если удалить этот файл или запустить `node force-reset-db.js`, база создаётся заново: останутся только 20 аккаунтов, все группы и переписки пропадут. Чтобы не потерять данные, не удаляйте `messenger.db` и при необходимости копируйте его как резервную копию.

---

## 2. Web app (browser)

```bash
cd client
npm install
npm run dev
```

Open **http://localhost:5173**. The dev server proxies API and Socket.io to the backend server at port 3001.

---

## 3. PC program (Electron) — запуск как программа

### Сборка установщика / exe (Windows)

1. Установите зависимости и соберите программу:

```bash
cd client
npm install
npm run electron:build
```

2. В папке `client/release/` появятся:
   - **Nova Setup 1.1.0.exe** — установщик
   - **win-unpacked/** — портативная папка с **Nova.exe** (можно запускать без установки)

3. **Один запуск (сервер + программа):** из корня проекта дважды щёлкните **start-nova.bat** — запустится сервер в фоне и откроется окно Nova. Сборка должна быть уже выполнена (см. шаг 1).

### Как сделать так, чтобы новые изменения были в приложении

Все изменения в коде (дизайн, меню, правки) попадают в программу только после **пересборки**:

| Что сделать | Когда использовать |
|-------------|---------------------|
| **Дважды щёлкнуть `update-app.bat`** | Уже ставили зависимости раньше — просто пересобрать exe (быстро). |
| **Дважды щёлкнуть `build-app.bat`** | Первый раз или после смены зависимостей — установка + сборка. |

После сборки обновлённые файлы лежат в `client/release/`:
- **Nova Setup 1.1.0.exe** — установщик  
- **win-unpacked/Nova.exe** — портативная программа  

Либо вручную в терминале из папки проекта:
```bash
cd client
npm run electron:build
```

### Режим разработки (изменения видны без пересборки)

Если правите код и хотите сразу видеть результат в окне приложения без пересборки exe:

```bash
cd client
npm install
npm run electron:dev
```

Откроется окно Nova (загрузка с http://localhost:5173). Сервер должен быть запущен на порту 3001 (в другом терминале: `cd server && npm start`). При сохранении файлов изменения подхватываются автоматически.

### Запуск без установщика (после сборки)

```bash
cd client
npm run build:app
npm run electron
```

Окно загрузит `dist/index.html` и будет обращаться к API по адресу http://localhost:3001. Сервер должен быть запущен отдельно.

---

## 4. Phone app (Capacitor – Android / iOS)

### Быстрая сборка APK (Windows)

Дважды щёлкните **`build-android-apk.bat`** в корне проекта — скрипт автоматически соберёт APK.

APK будет в: `client/android/app/build/outputs/apk/debug/app-debug.apk`

### Ручная сборка Android APK

1. **Установите зависимости** (если ещё не установлены):

```bash
cd client
npm install
```

2. **Соберите веб-версию** (и укажите `VITE_API_URL` если сервер не на localhost):

```bash
npm run build
# Или с указанием IP сервера для реального устройства:
VITE_API_URL=http://192.168.1.10:3001 npm run build
```

3. **Добавьте платформу Android** (один раз):

```bash
npx cap add android
```

4. **Синхронизируйте и откройте в Android Studio:**

**Android:**

```bash
npx cap sync android
npx cap open android
```

Then run the app from Android Studio (emulator or device).  
On device/emulator, use your machine’s IP for the server (e.g. `http://192.168.1.10:3001`) and build with:

```bash
VITE_API_URL=http://192.168.1.10:3001 npm run build
npx cap sync android
```

**iOS** (macOS only):

```bash
npx cap sync ios
npx cap open ios
```

Run from Xcode on simulator or device. Use the same `VITE_API_URL` approach if the server is not on localhost.

---

## 5. Развертывание на Яндекс.Облако

Для развертывания на виртуальном сервере в Яндекс.Облаке см. подробные инструкции:

- **Быстрый старт:** [`QUICK-DEPLOY.md`](QUICK-DEPLOY.md)
- **Подробная инструкция:** [`DEPLOY.md`](DEPLOY.md)

### Краткая инструкция:

1. Создайте виртуальную машину в Яндекс.Облаке (Ubuntu 22.04, 2 vCPU, 4 GB RAM)
2. Откройте порты 80, 443, 3001 в группе безопасности
3. Используйте автоматический скрипт деплоя:
   ```bash
   ./deploy-to-yandex-cloud.sh ubuntu@ваш-ip-адрес
   ```
4. Соберите и загрузите клиент:
   ```bash
   cd client
   VITE_API_URL=http://ваш-ip-адрес npm run build
   scp -r dist ubuntu@ваш-ip-адрес:~/nova-messenger/client/
   ```

После развертывания приложение будет доступно по адресу `http://ваш-ip-адрес` из любой точки мира.

---

## Accounts

The server creates **20 accounts** on startup with random passwords. Available logins:

- lololowkid
- After_981
- Bandl1k
- Shadow_2024
- NeonX7
- CyberWolf
- DarkPhoenix
- StormRider
- NightHawk
- Quantum99
- StarLight
- MysticX
- ThunderBolt
- FireStorm
- IceBreaker
- SkyWalker
- DragonSlayer
- BladeRunner
- GhostRider
- NovaStar

**Passwords are displayed in the server console** when you start the server. Each password is randomly generated (12 characters with letters, numbers, and symbols).

---

## Tech

- **Backend**: 
  - Node.js: Express, Socket.io, SQLite (sql.js)
  - C++: Crow framework, SQLite3, WebSocket
- **Frontend**: React, Vite
- **PC**: Electron
- **Mobile**: Capacitor (Android / iOS)
- **Calls**: WebRTC (STUN), signaling via Socket.io/WebSocket

## Notes

- **Server runs on port 3001**, **client on port 5173** (development).
- **Server must be running** for web, Electron, and mobile apps.
- **Account passwords** are printed to the server console on startup.
Nova Setup 1.0.0.exe- For **mobile**, use your computer’s LAN IP as `VITE_API_URL` when testing (same network).
- **Calls** need HTTPS or localhost in production for camera/mic.
