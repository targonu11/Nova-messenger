# Развёртывание Nova Messenger

## Сервер (Node)

1. Скопируйте папку `server` на VPS или ПК с белым IP / доменом.
2. Установите зависимости: `npm install`
3. Запуск: `npm start` или `set NODE_ENV=production&& node index.js` (Windows).
4. Переменные окружения:
   - `PORT` — порт HTTP (по умолчанию `3001`).
   - `NODE_ENV=production` — прод-режим (логи и сообщения в консоли).
5. Сервер слушает `0.0.0.0`, доступен в LAN и извне, если открыт порт в файрволе.
6. Проверка: `GET /api/health`, `GET /api/version`.

## Клиент (веб)

1. В `client` задайте `VITE_API_URL` на публичный URL API, например `https://api.example.com` или `http://203.0.113.10:3001`.
2. Сборка: `npm run build`, раздайте содержимое `client/dist` через nginx / статический хостинг.
3. Либо в браузере: **Настройки → Server & connection** — поле override (`localStorage` ключ `nova_api_base`) без пересборки.
4. До входа в аккаунт: на экране входа / регистрации ссылка **Server URL** — тот же override с перезагрузкой страницы.

## Мобильное приложение (Capacitor)

1. Укажите `VITE_API_URL` в `.env.production` перед `npm run build`.
2. Либо после установки приложения задайте override в настройках (тот же экран «Server & connection»).

## CORS и HTTPS

Для продакшена за reverse proxy (nginx) с TLS: проксируйте `/` на статику клиента и `/api` + WebSocket на Node-порт. В `server` уже используется `cors()` с широкими правилами; при необходимости сузьте origin в конфиге Express.
