@echo off
if exist build\Release\game_messenger_server_cpp.exe (
    echo Starting server...
    build\Release\game_messenger_server_cpp.exe
) else if exist build\Debug\game_messenger_server_cpp.exe (
    echo Starting server (Debug)...
    build\Debug\game_messenger_server_cpp.exe
) else (
    echo ERROR: Executable not found. Please run build.bat first.
    pause
    exit /b 1
)
