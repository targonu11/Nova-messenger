# 🚀 Быстрый старт: Развертывание Nova на Яндекс.Облако

## 📋 Что нужно сделать:

### 1️⃣ Создайте виртуальную машину в Яндекс.Облако

Следуйте инструкции: **[YANDEX-CLOUD-SETUP.md](YANDEX-CLOUD-SETUP.md)**

**Кратко:**
- Зайдите на https://console.cloud.yandex.ru/
- Создайте VM: Ubuntu 22.04, 2 vCPU, 4 GB RAM, 20 GB SSD
- Откройте порты: 22 (SSH), 80 (HTTP), 443 (HTTPS)
- Запишите публичный IP адрес

### 2️⃣ Разверните сервер

**Вариант A: Автоматический (Linux/Mac/Git Bash)**
```bash
chmod +x deploy-to-yandex-cloud.sh
./deploy-to-yandex-cloud.sh ubuntu@ваш-ip-адрес
```

**Вариант B: Ручной**
Следуйте инструкции: **[DEPLOY.md](DEPLOY.md)**

### 3️⃣ Соберите и загрузите клиент

**Windows:**
```powershell
cd client
$env:VITE_API_URL="http://ваш-ip-адрес"
npm run build
scp -r dist ubuntu@ваш-ip-адрес:~/nova-messenger/client/
```

**Linux/Mac:**
```bash
cd client
VITE_API_URL=http://ваш-ip-адрес npm run build
scp -r dist ubuntu@ваш-ip-адрес:~/nova-messenger/client/
```

**Или используйте готовый скрипт (Windows):**
```powershell
deploy-client.bat ubuntu@ваш-ip-адрес
```

### 4️⃣ Готово! 🎉

Откройте в браузере: **http://ваш-ip-адрес**

---

## 📚 Подробные инструкции:

- **[YANDEX-CLOUD-SETUP.md](YANDEX-CLOUD-SETUP.md)** - Создание VM в Яндекс.Облако
- **[QUICK-DEPLOY.md](QUICK-DEPLOY.md)** - Быстрое развертывание
- **[DEPLOY.md](DEPLOY.md)** - Подробная инструкция по деплою

## 🔧 Полезные команды:

```bash
# Подключение к серверу
ssh ubuntu@ваш-ip-адрес

# Просмотр логов
pm2 logs nova-server

# Перезапуск сервера
pm2 restart nova-server

# Статус сервера
pm2 status
```

## ❓ Проблемы?

См. раздел "Устранение проблем" в **[DEPLOY.md](DEPLOY.md)**
