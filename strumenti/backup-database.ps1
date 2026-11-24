# Backup completo del database Supabase del gestionale (tutte le tabelle, gli utenti e la struttura) in un file .sql.
#
#   -Imposta   chiede l'indirizzo "Session pooler" di Supabase con la password dentro e lo salva CIFRATO da Windows
#              (lo può leggere solo questo utente su questo PC; non va su GitHub e non si vede).
#   (niente)   fa il backup: Documenti\Backup gestionale\backup-gestionale-AAAA-MM-GG_HHMM.sql
#              tiene le copie degli ultimi 60 giorni (e comunque almeno le ultime 10), scrive tutto in backup.log.
#
# Lo usa anche il backup automatico di ogni giorno (attiva-backup-automatico.ps1).
param([switch]$Imposta, [int]$GiorniDaTenere = 60)

$ErrorActionPreference = "Stop"
$pgDump     = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
$cartellaCfg = Join-Path $env:LOCALAPPDATA "GestionaleMagazzino"
$fileCfg    = Join-Path $cartellaCfg "indirizzo-database.xml"
$cartella   = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Backup gestionale"
$log        = Join-Path $cartella "backup.log"

function Scrivi($testo) {
  $riga = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $testo
  Write-Host $testo
  if (Test-Path $cartella) { Add-Content -Path $log -Value $riga -Encoding UTF8 }
}

New-Item -ItemType Directory -Force -Path $cartella | Out-Null

if ($Imposta) {
  New-Item -ItemType Directory -Force -Path $cartellaCfg | Out-Null
  Write-Host ""
  Write-Host "Incolla l'indirizzo 'Session pooler' di Supabase CON la password al posto di [YOUR-PASSWORD]"
  Write-Host "(mentre incolli non si vede niente: e' normale). Poi premi Invio."
  $sicuro = Read-Host -AsSecureString "Indirizzo"
  $testo = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sicuro))
  if ($testo -notmatch '^postgres(ql)?://') { Write-Host "Non sembra l'indirizzo giusto: deve iniziare con postgresql://" -ForegroundColor Red; exit 1 }
  if ($testo -match '\[YOUR-PASSWORD\]') { Write-Host "Manca la password: togli [YOUR-PASSWORD] e scrivi la password del database" -ForegroundColor Red; exit 1 }
  $sicuro | Export-Clixml -Path $fileCfg
  Write-Host "Indirizzo salvato (cifrato). Adesso provo subito un backup..." -ForegroundColor Green
}

if (-not (Test-Path $pgDump)) { Scrivi "ERRORE: manca pg_dump ($pgDump). Va installato PostgreSQL 17 'Command Line Tools'."; exit 1 }
if (-not (Test-Path $fileCfg)) { Scrivi "ERRORE: indirizzo del database non ancora impostato. Avvia 'Backup gestionale - imposta.bat'."; exit 1 }

$sicuro = Import-Clixml -Path $fileCfg
$indirizzo = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sicuro))
$file = Join-Path $cartella ("backup-gestionale-{0}.sql" -f (Get-Date -Format "yyyy-MM-dd_HHmm"))

$ErrorActionPreference = "Continue"   # i messaggi di pg_dump non devono fermare lo script prima del controllo
& $pgDump $indirizzo -f $file 2>&1 | ForEach-Object { if ("$_" -notmatch 'password|postgres(ql)?://') { Scrivi "pg_dump: $_" } }
$ErrorActionPreference = "Stop"
$ok = $LASTEXITCODE -eq 0 -and (Test-Path $file) -and ((Get-Content $file -Tail 5) -join "`n") -match "dump complete"
if (-not $ok) {
  if (Test-Path $file) { Remove-Item $file -Force }
  Scrivi "ERRORE: backup NON riuscito (internet, password cambiata o Supabase in pausa?)."
  exit 1
}
Scrivi ("OK: {0} ({1:N0} KB)" -f (Split-Path $file -Leaf), ((Get-Item $file).Length / 1KB))

# Pulizia: via le copie piu' vecchie di $GiorniDaTenere giorni, ma ne restano sempre almeno 10
$copie = Get-ChildItem $cartella -Filter "backup-gestionale-*.sql" | Sort-Object LastWriteTime -Descending
$copie | Select-Object -Skip 10 | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$GiorniDaTenere) } | ForEach-Object {
  Remove-Item $_.FullName -Force; Scrivi "Tolta la copia vecchia $($_.Name)"
}
exit 0
