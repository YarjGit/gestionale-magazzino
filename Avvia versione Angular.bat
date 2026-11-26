@echo off
rem Avvia la NUOVA versione del gestionale (Angular, cartella frontend-angular) e la apre nel browser.
rem Non tocca il prototipo: quello si avvia sempre con "Avvia prototipo.bat".
rem Lascia aperta questa finestra mentre la usi; chiudila per spegnerla.
title Gestionale Magazzino - versione Angular
cd /d "%~dp0frontend-angular"
echo.
echo  Gestionale Magazzino - nuova versione (Angular)
echo  -----------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo  Manca Node.js su questo computer.
  echo  Scaricalo da https://nodejs.org ^(versione LTS^), installalo e poi riapri questo file.
  echo.
  pause
  exit /b 1
)
rem Pacchetti: si scaricano la prima volta e di nuovo solo se l'elenco (package-lock.json) e' cambiato con GitHub
set RIFARE=0
if not exist node_modules\.elenco-installato set RIFARE=1
if exist node_modules\.elenco-installato fc /b package-lock.json node_modules\.elenco-installato >nul 2>nul || set RIFARE=1
if "%RIFARE%"=="1" (
  echo  Scarico i pacchetti necessari ^(la prima volta qualche minuto^)...
  call npm ci
  if errorlevel 1 (
    echo  Errore nello scaricare i pacchetti. Controlla la connessione e riprova.
    pause
    exit /b 1
  )
  copy /y package-lock.json node_modules\.elenco-installato >nul
)
echo.
echo  Si apre nel browser all'indirizzo http://localhost:4200/
echo  Per vedere le schermate con dati inventati ^(senza accesso^): http://localhost:4200/?anteprima=1
echo  Per tornare ai dati veri: http://localhost:4200/?anteprima=0
echo  Per spegnerla chiudi questa finestra.
echo.
call npx ng serve --port 4200 --open
echo.
echo  La versione Angular si e' fermata. Se c'e' un errore qui sopra, forse e' gia' aperta in un'altra finestra.
echo  Se l'errore parla di pacchetti, cancella la cartella frontend-angular\node_modules e riapri questo file.
pause
