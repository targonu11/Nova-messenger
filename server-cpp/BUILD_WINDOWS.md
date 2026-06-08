# Сборка на Windows

## Шаг 1: Установка зависимостей

### Вариант A: Использование vcpkg (рекомендуется)

1. Установите **vcpkg**:
```powershell
git clone https://github.com/Microsoft/vcpkg.git
cd vcpkg
.\bootstrap-vcpkg.bat
```

2. Установите SQLite3:
```powershell
.\vcpkg install sqlite3:x64-windows
```

3. Интегрируйте vcpkg с CMake:
```powershell
.\vcpkg integrate install
```

### Вариант B: Ручная установка

1. **CMake**: Скачайте и установите с https://cmake.org/download/
   - При установке выберите "Add CMake to system PATH"

2. **SQLite3**: 
   - Скачайте с https://www.sqlite.org/download.html
   - Или используйте vcpkg (см. Вариант A)

3. **Компилятор C++**:
   - **Visual Studio 2019/2022** (Community Edition бесплатна)
   - Или **MinGW-w64**

## Шаг 2: Сборка проекта

Откройте PowerShell и выполните:

```powershell
# Перейдите в директорию проекта
cd "C:\Users\lololowkid\ьфч\server-cpp"

# Создайте папку для сборки
mkdir build
cd build

# Настройте CMake (для Visual Studio)
cmake .. -G "Visual Studio 17 2022" -A x64

# Или для MinGW:
# cmake .. -G "MinGW Makefiles"

# Соберите проект
cmake --build . --config Release

# Или для Debug:
# cmake --build . --config Debug
```

## Шаг 3: Запуск

После сборки исполняемый файл будет в:
- `build\Release\game_messenger_server_cpp.exe` (Release)
- `build\Debug\game_messenger_server_cpp.exe` (Debug)

Запустите:
```powershell
.\Release\game_messenger_server_cpp.exe
```

## Альтернатива: Упрощенная сборка без CMake

Если CMake вызывает проблемы, можно собрать вручную с помощью Visual Studio или создать простой batch файл.
