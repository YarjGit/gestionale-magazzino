@echo off
rem Da fare UNA volta sola su questo PC: chiede l'indirizzo del database (con la password), fa un backup di prova
rem e attiva il backup automatico di ogni giorno. Le copie vanno in Documenti\Backup gestionale.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0strumenti\backup-database.ps1" -Imposta
if errorlevel 1 goto fine
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0strumenti\attiva-backup-automatico.ps1"
:fine
echo.
pause
