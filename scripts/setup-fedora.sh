#!/usr/bin/env bash
# Подготовка окружения Nova на Fedora (новая установка ОС).
# Запуск: из корня репозитория: bash scripts/setup-fedora.sh
# Или: chmod +x scripts/setup-fedora.sh && ./scripts/setup-fedora.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f /etc/os-release ]]; then
  # shellcheck source=/dev/null
  . /etc/os-release
  echo "ОС: ${NAME:-?} ${VERSION_ID:-}"
fi

echo ">>> Установка базовых пакетов (нужен sudo)..."
sudo dnf install -y git nodejs npm which

# Инструменты для нативных модулей и сборки Electron (по желанию)
echo ">>> Установка зависимостей для сборки (Electron, node-gyp)..."
sudo dnf install -y \
  python3 \
  make \
  gcc-c++ \
  rpm-build \
  libX11-devel \
  libxcb-devel \
  libXtst-devel \
  libpng-devel \
  zlib-devel \
  || true

echo ">>> Версии:"
node -v
npm -v

echo ">>> npm install (server + client)..."
(cd "$ROOT/server" && npm install)
(cd "$ROOT/client" && npm install)

if [[ -f "$ROOT/start-nova-linux.sh" ]]; then
  chmod +x "$ROOT/start-nova-linux.sh" 2>/dev/null || true
fi

echo ""
echo "Готово. Дальше:"
echo "  ./start-nova-linux.sh        — сервер + Electron (разработка)"
echo "  ./start-nova-linux.sh web    — только веб (launcher.js)"
echo "  ./start-nova-linux.sh build  — сборка .AppImage и .deb (в client/release/)"
echo ""
echo "Открой эту папку в Cursor: File → Open Folder → $ROOT"
