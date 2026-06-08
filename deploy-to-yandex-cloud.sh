#!/bin/bash

# Скрипт для развертывания Nova на Яндекс.Облако
# Использование: ./deploy-to-yandex-cloud.sh user@server-ip

set -e

if [ -z "$1" ]; then
    echo "Использование: $0 user@server-ip [domain-or-ip]"
    echo "Пример: $0 ubuntu@158.160.123.45"
    echo "Пример: $0 ubuntu@158.160.123.45 mydomain.com"
    exit 1
fi

SERVER=$1
DOMAIN=${2:-""}
SERVER_USER=$(echo $SERVER | cut -d@ -f1)
SERVER_HOST=$(echo $SERVER | cut -d@ -f2)

echo "=========================================="
echo "  Развертывание Nova на Яндекс.Облако"
echo "=========================================="
echo "Сервер: $SERVER"
echo "Домен/IP: ${DOMAIN:-$SERVER_HOST}"
echo ""

# Проверка подключения
echo "[1/10] Проверка подключения к серверу..."
ssh -o ConnectTimeout=5 $SERVER "echo 'Подключение успешно'" || {
    echo "❌ Не удалось подключиться к серверу"
    echo "Проверьте:"
    echo "  1. Сервер доступен"
    echo "  2. SSH ключи настроены"
    echo "  3. IP адрес правильный"
    exit 1
}

echo "✓ Подключение установлено"
echo ""

# Установка Node.js
echo "[2/10] Проверка Node.js..."
ssh $SERVER "command -v node >/dev/null 2>&1 || {
    echo 'Установка Node.js...'
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
}"
echo "✓ Node.js установлен"
echo ""

# Установка Nginx
echo "[3/10] Проверка Nginx..."
ssh $SERVER "command -v nginx >/dev/null 2>&1 || {
    echo 'Установка Nginx...'
    sudo apt update
    sudo apt install -y nginx
    sudo systemctl enable nginx
    sudo systemctl start nginx
}"
echo "✓ Nginx установлен"
echo ""

# Установка PM2
echo "[4/10] Проверка PM2..."
ssh $SERVER "command -v pm2 >/dev/null 2>&1 || {
    echo 'Установка PM2...'
    sudo npm install -g pm2
}"
echo "✓ PM2 установлен"
echo ""

# Создание директории проекта
echo "[5/10] Создание директории проекта..."
ssh $SERVER "mkdir -p ~/nova-messenger/server ~/nova-messenger/client"
echo "✓ Директории созданы"
echo ""

# Загрузка файлов сервера
echo "[6/10] Загрузка файлов сервера..."
rsync -avz --exclude 'node_modules' --exclude '*.db' --exclude '.env' \
    server/ $SERVER:~/nova-messenger/server/
echo "✓ Файлы сервера загружены"
echo ""

# Установка зависимостей сервера
echo "[7/10] Установка зависимостей сервера..."
ssh $SERVER "cd ~/nova-messenger/server && npm install"
echo "✓ Зависимости установлены"
echo ""

# Настройка .env
echo "[8/10] Настройка переменных окружения..."
if [ -n "$DOMAIN" ]; then
    API_URL="http://$DOMAIN"
else
    API_URL="http://$SERVER_HOST"
fi

ssh $SERVER "cd ~/nova-messenger/server && \
    if [ ! -f .env ]; then \
        cp .env.example .env; \
    fi && \
    sed -i 's|DOMAIN=.*|DOMAIN=$DOMAIN|' .env && \
    sed -i 's|NODE_ENV=.*|NODE_ENV=production|' .env"
echo "✓ Переменные окружения настроены"
echo ""

# Запуск сервера через PM2
echo "[9/10] Запуск сервера..."
ssh $SERVER "cd ~/nova-messenger/server && \
    pm2 delete nova-server 2>/dev/null || true && \
    pm2 start index.js --name nova-server && \
    pm2 save"
echo "✓ Сервер запущен"
echo ""

# Настройка Nginx
echo "[10/10] Настройка Nginx..."
NGINX_CONFIG=$(cat <<EOF
server {
    listen 80;
    server_name ${DOMAIN:-$SERVER_HOST};

    # Статические файлы клиента
    location / {
        root /home/$SERVER_USER/nova-messenger/client/dist;
        try_files \$uri \$uri/ /index.html;
        index index.html;
    }

    # API проксирование
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Socket.io проксирование
    location /socket.io {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Загрузка файлов
    location /uploads {
        proxy_pass http://localhost:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF
)

ssh $SERVER "echo '$NGINX_CONFIG' | sudo tee /etc/nginx/sites-available/nova > /dev/null && \
    sudo ln -sf /etc/nginx/sites-available/nova /etc/nginx/sites-enabled/ && \
    sudo rm -f /etc/nginx/sites-enabled/default && \
    sudo nginx -t && \
    sudo systemctl reload nginx"
echo "✓ Nginx настроен"
echo ""

echo "=========================================="
echo "  ✓ Развертывание завершено!"
echo "=========================================="
echo ""
echo "Следующие шаги:"
echo ""
echo "1. Соберите клиент с правильным API URL:"
echo "   cd client"
echo "   VITE_API_URL=$API_URL npm run build"
echo ""
echo "2. Загрузите собранный клиент на сервер:"
echo "   scp -r client/dist $SERVER:~/nova-messenger/client/"
echo ""
echo "3. Проверьте работу:"
echo "   Откройте в браузере: $API_URL"
echo ""
echo "4. Просмотр логов сервера:"
echo "   ssh $SERVER 'pm2 logs nova-server'"
echo ""
