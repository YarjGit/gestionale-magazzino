@echo off
rem Fa subito una copia di sicurezza del database (Documenti\Backup gestionale) e apre la cartella.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0strumenti\backup-database.ps1"
explorer "%USERPROFILE%\Documents\Backup gestionale"
echo.
pause
