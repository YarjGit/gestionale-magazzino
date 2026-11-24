# Backup automatico del database ogni giorno (Utilita' di pianificazione di Windows), con backup-database.ps1.
#   Ora: alle 13:00 di ogni giorno; se il PC era spento lo fa appena si riaccende.
#   -Togli   disattiva il backup automatico.
param([string]$Ora = "13:00", [switch]$Togli)

$ErrorActionPreference = "Stop"
$nome = "Backup gestionale magazzino"
if ($Togli) {
  Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Backup automatico disattivato." -ForegroundColor Yellow
  exit 0
}
$script = Join-Path $PSScriptRoot "backup-database.ps1"
$azione = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$quando = New-ScheduledTaskTrigger -Daily -At $Ora
$regole = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName $nome -Action $azione -Trigger $quando -Settings $regole -Description "Copia di sicurezza giornaliera del database Supabase del gestionale (Documenti\Backup gestionale)" -Force | Out-Null
Write-Host "Backup automatico attivo: ogni giorno alle $Ora (se il PC e' spento, appena si riaccende)." -ForegroundColor Green
Write-Host "Le copie sono in: $([Environment]::GetFolderPath('MyDocuments'))\Backup gestionale"
