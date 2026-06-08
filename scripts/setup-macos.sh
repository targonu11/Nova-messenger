#!/usr/bin/env bash
# Подготовка окружения Nova на macOS (новая машина / Cursor).
# Запуск из корня репозитория: bash scripts/setup-macos.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "ОС: $(uname -s) $(uname -m)"

if ! command -v brew &>/dev/null; then
  echo "Установите Homebrew: https://brew.sh"
  echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  exit 1
fi

echo ">>> brew install node git (при необходимости)..."
brew list node &>/dev/null || brew install node
brew list git &>/dev/null || brew install git

echo ">>> Версии:"
node -v
npm -v

echo ">>> npm install (server + client)..."
(cd "$ROOT/server" && npm install)
(cd "$ROOT/client" && npm install)

if [[ -f "$ROOT/start-nova-macos.sh" ]]; then
  chmod +x "$ROOT/start-nova-macos.sh" 2>/dev/null || true
fi
chmod +x "$ROOT/start-nova-linux.sh" 2>/dev/null || true

echo ""
echo "Для сборки Electron-приложения (dmg) при первом запуске может понадобиться:"
echo "  xcode-select --install"
echo ""
echo "Для iOS: установи Xcode из App Store, затем в client/ios:"
echo "  sudo gem install cocoapods   # или brew install cocoapods"
echo ""
echo "Дальше:"
echo "  ./start-nova-macos.sh"
echo "  ./start-nova-macos.sh ios    # после cap add ios (см. SETUP-APPLE.md)"
echo ""
echo "Открой папку в Cursor: $ROOT"
