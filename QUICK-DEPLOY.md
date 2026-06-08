# Быстрое развертывание на Яндекс.Облако

## Вариант 1: Автоматический деплой (Linux/Mac)

### Требования:
- SSH доступ к серверу
- Git установлен локально

### Шаги:

1. **Сделайте скрипт исполняемым:**
```bash
chmod +x deploy-to-yandex-cloud.sh
```

2. **Запустите деплой:**
```bash
./deploy-to-yandex-cloud.sh ubuntu@ваш-ip-адрес
# или с доменом:
./deploy-to-yandex-cloud.sh ubuntu@ваш-ip-адрес yourdomain.com
```

3. **Соберите и загрузите клиент:**
```bash
cd client
VITE_API_URL=http://ваш-ip-адрес npm run build
scp -r dist ubuntu@ваш-ip-адрес:~/nova-messenger/client/
```

4. **Готово!** Откройте `http://ваш-ip-адрес` в браузере

## Вариант 2: Ручной деплой (Windows)

### Шаги:

1. **Подключитесь к серверу:**
```powershell
ssh ubuntu@ваш-ip-адрес
```

2. **На сервере выполните:**

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Установка Nginx
sudo apt install -y nginx

# Установка PM2
sudo npm install -g pm2

# Создание директорий
mkdir -p ~/nova-messenger/server ~/nova-messenger/client
```

3. **Загрузите файлы сервера** (через WinSCP, FileZilla или SCP):
   - Загрузите всю папку `server/` в `~/nova-messenger/server/`

4. **На сервере:**

```bash
cd ~/nova-messenger/server
npm install
cp .env.example .env
nano .env  # Установите DOMAIN=ваш-ip-адрес
pm2 start index.js --name nova-server
pm2 save
pm2 startup  # Следуйте инструкциям
```

5. **Настройте Nginx:**

```bash
sudo nano /etc/nginx/sites-available/nova
```

Вставьте конфигурацию из `DEPLOY.md` (раздел "Настройка Nginx")

```bash
sudo ln -s /etc/nginx/sites-available/nova /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

6. **На вашем компьютере соберите клиент:**

```powershell
cd client
$env:VITE_API_URL="http://ваш-ip-адрес"
npm run build
```

7. **Загрузите клиент на сервер:**

```powershell
scp -r client\dist ubuntu@ваш-ip-адрес:~/nova-messenger/client/
```

8. **Готово!** Откройте `http://ваш-ip-адрес`

## Вариант 3: Использование готового скрипта (Windows)

1. **Запустите автоматический деплой сервера:**
   - Используйте WSL (Windows Subsystem for Linux) или Git Bash
   - Выполните команды из Варианта 1

2. **Используйте готовый скрипт для клиента:**
```powershell
deploy-client.bat ubuntu@ваш-ip-адрес
```

## Проверка работы

1. **Проверьте API:**
   - Откройте: `http://ваш-ip-адрес/api/test`
   - Должен вернуться JSON: `{"status":"ok"}`

2. **Проверьте главную страницу:**
   - Откройте: `http://ваш-ip-адрес`
   - Должна открыться страница входа

3. **Проверьте логи:**
```bash
ssh ubuntu@ваш-ip-адрес
pm2 logs nova-server
```

## Обновление приложения

### Обновление сервера:
```bash
ssh ubuntu@ваш-ip-адрес
cd ~/nova-messenger/server
# Загрузите новые файлы или git pull
npm install  # если изменились зависимости
pm2 restart nova-server
```

### Обновление клиента:
```powershell
cd client
$env:VITE_API_URL="http://ваш-ip-адрес"
npm run build
scp -r dist ubuntu@ваш-ip-адрес:~/nova-messenger/client/
```

## Настройка домена (опционально)

1. **Настройте DNS:**
   - Создайте A-запись, указывающую на IP вашего сервера

2. **Получите SSL сертификат:**
```bash
ssh ubuntu@ваш-ip-адрес
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

3. **Обновите клиент с HTTPS:**
```powershell
cd client
$env:VITE_API_URL="https://yourdomain.com"
npm run build
scp -r dist ubuntu@ваш-ip-адрес:~/nova-messenger/client/
```

## Полезные команды

```bash
# Просмотр статуса сервера
pm2 status

# Просмотр логов
pm2 logs nova-server

# Перезапуск
pm2 restart nova-server

# Остановка
pm2 stop nova-server

# Проверка Nginx
sudo nginx -t
sudo systemctl status nginx

# Просмотр портов
sudo netstat -tulpn | grep :3001
```
