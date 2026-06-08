#!/usr/bin/env bash
# Nova — запуск на Linux (аналог start-nova-all2.bat)
#
# Первая настройка на Fedora: см. SETUP-FEDORA.md или:
#   bash scripts/setup-fedora.sh
#   npm run setup:fedora
#
# Использование:
#   ./start-nova-linux.sh           — сервер + Electron dev (режим pc)
#   ./start-nova-linux.sh pc      — то же
#   ./start-nova-linux.sh web       — сервер + Vite (браузер http://localhost:5173)
#   ./start-nova-linux.sh build     — только сборка .AppImage и .deb (из каталога client, нужен Node на Linux)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

MODE="${1:-pc}"

if ! command -v node &>/dev/null; then
  echo "Ошибка: Node.js не найден. Установите Node.js (например: sudo apt install nodejs npm)."
  exit 1
fi

if [[ ! -d "$ROOT/server/node_modules" ]]; then
  echo "Устанавливаю зависимости сервера..."
  (cd "$ROOT/server" && npm install)
fi

if [[ ! -d "$ROOT/client/node_modules" ]]; then
  echo "Устанавливаю зависимости клиента..."
  (cd "$ROOT/client" && npm install)
fi

SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

case "$MODE" in
  web)
    echo "========================================"
    echo "  Nova — веб (сервер + Vite)"
    echo "========================================"
    exec node "$ROOT/launcher.js"
    ;;
  build)
    echo "========================================"
    echo "  Nova — сборка Linux (AppImage + deb)"
    echo "  Запускайте на Linux или WSL2 с зависимостями electron-builder"
    echo "========================================"
    (cd "$ROOT/client" && npm run electron:build:linux)
    echo ""
    echo "Артефакты: client/release/"
    exit 0
    ;;
  pc|all|"")
    echo "========================================"
    echo "  Nova — сервер + Electron (dev)"
    echo "========================================"
    echo "Сервер: http://localhost:3001"
    echo "Vite:   http://localhost:5173"
    echo ""
    (cd "$ROOT/server" && node index.js) &
    SERVER_PID=$!
    sleep 2
    (cd "$ROOT/client" && npm run electron:dev)
    ;;
  *)
    echo "Неизвестный режим: $MODE"
    echo "Допустимо: pc | web | build | all (как pc)"
    exit 1
    ;;
esac
