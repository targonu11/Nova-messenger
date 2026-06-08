#!/usr/bin/env bash
# Nova — запуск на macOS (аналог start-nova-linux.sh / start-nova-all2.bat)
#
# Первая настройка: см. SETUP-APPLE.md или:
#   bash scripts/setup-macos.sh
#   npm run setup:macos
#
# Использование:
#   ./start-nova-macos.sh           — сервер + Electron dev
#   ./start-nova-macos.sh web       — сервер + Vite (браузер)
#   ./start-nova-macos.sh build     — сборка .dmg и .zip (client/release/)
#   ./start-nova-macos.sh ios       — сборка web + Capacitor iOS + Xcode
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

MODE="${1:-pc}"

if ! command -v node &>/dev/null; then
  echo "Node.js не найден. Установите Node (brew install node) — см. SETUP-APPLE.md"
  exit 1
fi

[[ -d "$ROOT/server/node_modules" ]] || (cd "$ROOT/server" && npm install)
[[ -d "$ROOT/client/node_modules" ]] || (cd "$ROOT/client" && npm install)

SERVER_PID=""
cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

case "$MODE" in
  web)
    echo "Nova — веб (сервер + Vite)"
    exec node "$ROOT/launcher.js"
    ;;
  build)
    echo "Nova — сборка macOS (dmg + zip, x64 + arm64)"
    (cd "$ROOT/client" && npm run electron:build:mac)
    echo "Готово: client/release/"
    exit 0
    ;;
  ios)
    echo "Nova — iOS (нужны Xcode и CocoaPods: см. SETUP-APPLE.md)"
    (cd "$ROOT/client" && npm run cap:ios)
    exit 0
    ;;
  pc|all|"")
    echo "Nova — сервер + Electron (dev)"
    (cd "$ROOT/server" && node index.js) &
    SERVER_PID=$!
    sleep 2
    (cd "$ROOT/client" && npm run electron:dev)
    ;;
  *)
    echo "Неизвестный режим: $MODE (pc | web | build | ios | all)"
    exit 1
    ;;
esac
