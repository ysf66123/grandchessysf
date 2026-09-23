@echo off
cd /d "%~dp0"
title Grandmaster Pro Sunucusu
echo ==============================================
echo Grandmaster Pro Yerel Sunucu Baslaticisi
echo ==============================================
echo.
echo Node.js modulleri kuruluyor (sadece ilk seferde zaman alabilir)...
call npm install
echo.
echo Sunucu baslatiliyor...
node server.js
pause