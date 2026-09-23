@echo off
cd /d "%~dp0"
title Wild Rift otomatik veri guncelleme
node scripts\wild-rift-local.cjs --watch
pause
