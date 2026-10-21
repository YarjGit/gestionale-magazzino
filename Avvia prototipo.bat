@echo off
rem Avvia il prototipo del gestionale e lo apre nel browser.
rem Lascia aperta questa finestra mentre usi il prototipo; chiudila per spegnerlo.
title Prototipo Gestionale Magazzino
echo.
echo  Prototipo Gestionale Magazzino
echo  -----------------------------
echo  Si apre nel browser all'indirizzo http://localhost:8080/
echo  Per spegnerlo chiudi questa finestra.
echo.
start "" http://localhost:8080/login.html
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0prototipo\server.ps1" -Port 8080
echo.
echo  Il prototipo si e' fermato. Se c'e' un errore qui sopra, forse e' gia' aperto in un'altra finestra.
pause
