# Nova на Fedora (новая система + Cursor)

На **macOS / iOS** см. [SETUP-APPLE.md](./SETUP-APPLE.md).

---


Кратко: склонируй репозиторий, выполни установку зависимостей и открой проект в Cursor.

## 1. Системные пакеты

Из корня репозитория:

```bash
bash scripts/setup-fedora.sh
```

Скрипт ставит через `dnf`: `git`, `nodejs`, `npm`, плюс пакеты для сборки Electron (gcc, python3, библиотеки X11 и т.д.).

Если хочешь только минимум без сборки десктопа:

```bash
sudo dnf install -y git nodejs npm
cd server && npm install && cd ../client && npm install
```

## 2. Node поновее (по желанию)

В репозиториях Fedora иногда старее LTS. Варианты:

- [NodeSource](https://github.com/nodesource/distributions) под твою версию Fedora  
- или [nvm](https://github.com/nvm-sh/nvm): `nvm install --lts` и дальше `npm install` в `server` и `client`

## 3. Запуск разработки

```bash
chmod +x start-nova-linux.sh
./start-nova-linux.sh          # сервер :3001 + Electron + Vite :5173
./start-nova-linux.sh web      # только браузер (без Electron)
```

## 4. Cursor на Fedora

1. Скачай **Cursor** с [cursor.com](https://cursor.com) (Linux) — обычно AppImage или установщик.
2. **File → Open Folder** → выбери каталог с этим проектом (где лежат `server/`, `client/`).
3. Расширения и настройки подтянутся как на другой машине, если включишь синхронизацию в Cursor/VS Code.

Рабочая копия проекта — одна и та же: **git clone** на Fedora, дальше коммиты и пуш с любой машины.

## 5. Сборка Linux-приложения (AppImage / deb)

Только на Linux (или WSL2 с полноценным окружением):

```bash
cd client && npm run electron:build:linux
```

Результат: `client/release/`

Нужна иконка `client/build/icon.png` (например 512×512). Если её нет — положи файл или временно убери поле `icon` в секции `linux` в `client/package.json`.

## 6. Firewall

Локальная разработка (`localhost`, порты 3001 и 5173) обычно не требует открытия портов в `firewalld`. Если сервер смотрит наружу — настрой зоны и порты отдельно.

## 7. SELinux

При странных ошибках доступа к файлам в каталоге проекта (редко) можно временно проверить логи: `ausearch -m avc -ts recent`. Обычно для `~/dev/...` проблем нет.
