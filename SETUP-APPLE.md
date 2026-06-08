# Nova на Apple: macOS (десктоп) и iOS (айфон)

Здесь — **macOS** как у Linux (Electron + скрипты) и **iOS** через Capacitor (как Android в проекте).

---

## macOS — разработка и сборка

### Быстрая установка

```bash
bash scripts/setup-macos.sh
# или
npm run setup:macos
```

Нужен [Homebrew](https://brew.sh). Скрипт ставит **node** и **git**, затем `npm install` в `server` и `client`.

### Запуск

```bash
chmod +x start-nova-macos.sh
./start-nova-macos.sh          # сервер :3001 + Electron + Vite :5173
./start-nova-macos.sh web      # только веб (launcher.js)
./start-nova-macos.sh build    # сборка установщика (см. ниже)
```

Или из корня репозитория: `npm run start:macos` (если добавлен в `package.json`).

### Сборка приложения для Mac (.dmg / .zip)

Требуется Xcode Command Line Tools:

```bash
xcode-select --install
```

Сборка:

```bash
cd client && npm run electron:build:mac
```

Артефакты: `client/release/` (обычно **dmg** и **zip** под **Intel и Apple Silicon**, если задано в `package.json`).

Иконка: положи **`client/build/icon.icns`**. Если её нет — временно убери поле `icon` в секции **`mac`** в `client/package.json` или создай иконку (например из PNG через `iconutil`).

Подпись и нотаризация для распространения вне Mac — отдельная настройка Apple Developer; для локальной сборки достаточно без нотаризации.

---

## iOS (айфон) — Capacitor

Нужны **macOS**, **Xcode** из App Store и учётная запись Apple Developer для установки на устройство / TestFlight.

### Один раз

1. Установи зависимости проекта (`setup-macos.sh` выше).
2. Собери веб-клиент и добавь платформу **ios** (если папки `client/ios` ещё нет):

```bash
cd client
npm run build
npx cap add ios
```

3. Установи **CocoaPods** (для нативных зависимостей):

```bash
sudo gem install cocoapods
# или: brew install cocoapods
```

4. Синхронизация и открытие Xcode:

```bash
npm run cap:ios
```

Или из корня репозитория:

```bash
./start-nova-macos.sh ios
```

### Дальше

- В Xcode: выбери **Team** для подписи, подключи iPhone или симулятор, **Run**.
- Адрес API: для реального устройства укажи IP сервера в `VITE_API_URL` при сборке или настройте прокси (см. `client` / `.env`).

---

## Работа в Cursor на Mac

**File → Open Folder** → каталог с `server/` и `client/`. Тот же репозиторий, что и на Windows/Linux — через **git** переносишь изменения между машинами.

---

## Кратко по командам

| Действие              | Команда |
|-----------------------|---------|
| Настроить окружение   | `npm run setup:macos` |
| Разработка Electron   | `./start-nova-macos.sh` |
| Веб без Electron      | `./start-nova-macos.sh web` |
| Сборка Mac-приложения | `cd client && npm run electron:build:mac` |
| iOS в Xcode           | `./start-nova-macos.sh ios` или `cd client && npm run cap:ios` |
