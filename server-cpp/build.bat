@echo off
echo Building Game Messenger Server (C++)...
echo.

REM Check if CMake is installed
where cmake >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: CMake is not installed or not in PATH
    echo Please install CMake from https://cmake.org/download/
    echo.
    pause
    exit /b 1
)

REM Create build directory
if not exist build mkdir build
cd build

REM Configure with CMake
echo Configuring with CMake...
cmake .. -G "Visual Studio 17 2022" -A x64
if %ERRORLEVEL% NEQ 0 (
    echo Trying MinGW Makefiles...
    cmake .. -G "MinGW Makefiles"
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: CMake configuration failed
        pause
        exit /b 1
    )
)

REM Build
echo.
echo Building project...
cmake --build . --config Release
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo Build successful!
echo Executable: build\Release\game_messenger_server_cpp.exe
echo.
pause
