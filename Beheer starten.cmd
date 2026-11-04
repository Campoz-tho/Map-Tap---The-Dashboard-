@echo off
cd /d "%~dp0"
start "" http://localhost:8080/beheer.html
node server.mjs
pause
