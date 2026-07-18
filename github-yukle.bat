@echo off
title GitHub'a Yukle
echo ===================================================
echo   Grandmaster Pro - GitHub'a Yukleme Araci
echo ===================================================
echo.

:: Git kurulu mu kontrol et
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [HATA] Git bilgisayarinizda yuklu degil!
    echo Lutfen https://git-scm.com/downloads adresinden Git indirip yukleyin.
    echo.
    pause
    exit /b
)

:: Eger .git klasoru yoksa, depoyu baslat ve remote ekle
if not exist .git (
    echo [BILGI] Git deposu baslatiliyor...
    git init
    git config user.email "unsalyusuf891@gmail.com"
    git config user.name "ysf66123"
    git remote add origin https://github.com/ysf66123/grandchessysf.git
    git branch -M main
)

echo [BILGI] Dosyalar ekleniyor...
git add .

echo [BILGI] Degisiklikler kaydediliyor...
git commit -m "Site dosyalarini guncelle"

echo [BILGI] GitHub'a yukleniyor...
git push -u origin main --force

if %errorlevel% neq 0 (
    echo.
    echo [HATA] Yukleme sirasinda bir hata olustu. 
    echo Eger daha once giris yapmadiysaniz, acilan pencereden GitHub hesabiniza giris yapin.
    echo Eger erisim hatasi aliyorsaniz, GitHub hesabiniza bagli oldugunuzdan emin olun.
) else (
    echo.
    echo [BASARILI] Dosyalar basariyla GitHub'a yuklendi!
)

echo.
pause
