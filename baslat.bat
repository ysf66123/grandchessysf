@echo off
title Grandmaster Pro Yerel Sunucu
echo ===================================================
echo   Grandmaster Pro Yerel Sunucu Baslatiliyor...
echo ===================================================
echo.

:: Node.js yuklu mu kontrol et
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [HATA] Node.js bilgisayarinizda yuklu degil!
    echo Lutfen https://nodejs.org adresinden Node.js indirip yukleyin.
    echo Yukledikten sonra bu dosyayi tekrar calistirin.
    echo.
    pause
    exit /b
)

:: node_modules klasoru var mi kontrol et, yoksa yukle
if not exist node_modules (
    echo [BILGI] Gerekli paketler (node_modules) bulunamadi.
    echo Paketler yukleniyor (npm install)... Lutfen bekleyin...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo [HATA] Paketler yuklenirken bir hata olustu!
        pause
        exit /b
    )
)

echo [OK] Paketler kontrol edildi.
echo [BILGI] Sunucu baslatiliyor ve tarayici aciliyor...
echo.

:: Sunucu acilana kadar kisa bir gecikme ekleyip tarayiciyi acalim (ping ile 3 saniye)
start /b cmd /c "ping 127.0.0.1 -n 4 >nul && start http://localhost:3000"

:: Sunucuyu baslat
call npm start
