#!/bin/bash
echo "==================================================="
echo "  Grandmaster Pro - GitHub'a Yukleme Araci"
echo "==================================================="
echo ""

# Git kurulu mu kontrol et
if ! command -v git &> /dev/null
then
    echo "[HATA] Git bilgisayarinizda yuklu degil!"
    echo "Lutfen Git indirip yukleyin."
    read -p "Cikmak icin Enter'a basin..."
    exit 1
fi

# Eger .git klasoru yoksa, depoyu baslat ve remote ekle
if [ ! -d ".git" ]; then
    echo "[BILGI] Git deposu baslatiliyor..."
    git init
    git config user.email "unsalyusuf891@gmail.com"
    git config user.name "ysf66123"
    git remote add origin https://github.com/ysf66123/grandchessysf.git
    git branch -M main
fi

echo "[BILGI] Dosyalar ekleniyor..."
git add .

echo "[BILGI] Degisiklikler kaydediliyor..."
datetime=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "Site dosyalarini guncelle $datetime"

echo "[BILGI] GitHub'a yukleniyor..."
git push -u origin main --force

if [ $? -ne 0 ]; then
    echo ""
    echo "[HATA] Yukleme sirasinda bir hata olustu."
    echo "Lutfen GitHub hesabiniza giris yaptiginizdan emin olun."
else
    echo ""
    echo "[BASARILI] Dosyalar basariyla GitHub'a yuklendi!"
fi

echo ""
read -p "Cikmak icin Enter'a basin..."
