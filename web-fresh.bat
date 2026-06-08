@echo off
rem Сервер + веб: кэш .vite очищается в launcher.js; здесь дополнительно --force
cd /d "%~dp0"
set VITE_FORCE=1
node launcher.js
