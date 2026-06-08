# Game Messenger Server (C++)

C++ версия сервера мессенджера с использованием Crow framework, SQLite и WebSocket.

## Требования

- **CMake** 3.15 или выше
- **C++17** компилятор (GCC, Clang, или MSVC)
- **SQLite3** библиотека
- **pkg-config** (для поиска SQLite3)

### Установка зависимостей

**Ubuntu/Debian:**
```bash
sudo apt-get install build-essential cmake libsqlite3-dev pkg-config
```

**macOS:**
```bash
brew install cmake sqlite3 pkg-config
```

**Windows:**
- Установите CMake: https://cmake.org/download/
- Установите SQLite3 или используйте vcpkg:
```powershell
vcpkg install sqlite3
```

## Сборка

```bash
cd server-cpp
mkdir build
cd build
cmake ..
cmake --build .
```

Или для Release версии:
```bash
cmake -DCMAKE_BUILD_TYPE=Release ..
cmake --build .
```

## Запуск

```bash
./game_messenger_server_cpp
```

Или с указанием порта:
```bash
./game_messenger_server_cpp 3001
```

Или через переменную окружения:
```bash
PORT=3001 ./game_messenger_server_cpp
```

Сервер запустится на **http://localhost:3001**

## Структура проекта

```
server-cpp/
├── CMakeLists.txt      # Конфигурация сборки
├── include/            # Заголовочные файлы
│   ├── db.h           # Работа с базой данных
│   ├── server.h       # HTTP/WebSocket сервер
│   └── utils.h        # Утилиты (base64, UUID, токены)
├── src/                # Исходные файлы
│   ├── main.cpp       # Точка входа
│   ├── db.cpp         # Реализация работы с БД
│   ├── server.cpp     # Реализация сервера
│   └── utils.cpp      # Реализация утилит
└── README.md          # Этот файл
```

## API Endpoints

Сервер предоставляет те же API endpoints, что и Node.js версия:

- `POST /api/auth/login` - Авторизация
- `GET /api/users` - Список пользователей
- `POST /api/users/avatar` - Загрузка аватара
- `GET /api/groups` - Список групп пользователя
- `POST /api/groups` - Создание группы
- `GET /api/groups/:id/members` - Участники группы
- `GET /api/messages` - Получение сообщений
- `GET /uploads/:filename` - Статические файлы

## WebSocket

WebSocket endpoint: `/socket.io/`

События:
- `auth` - Авторизация через токен
- `send_message` - Отправка сообщения
- `call:offer`, `call:answer`, `call:ice`, `call:hangup` - WebRTC звонки

## База данных

База данных SQLite создается автоматически при первом запуске в файле `messenger.db` в текущей директории.

При первом запуске автоматически создаются 20 пользователей:
- Логины: `alice`, `bob`, `carol`, ... `tina`
- Пароли: `pass1`, `pass2`, ... `pass20`

## Заметки

- Сервер использует библиотеку **Crow** для HTTP и WebSocket
- База данных **SQLite3** для хранения данных
- JSON обработка через **nlohmann/json**
- Все зависимости загружаются автоматически через CMake FetchContent

## Отличия от Node.js версии

- Более высокая производительность
- Меньше потребление памяти
- Нативная компиляция
- Требует компиляции перед запуском
