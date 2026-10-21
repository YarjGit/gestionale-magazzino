# Prepara i file CSV da importare in Supabase (Table Editor -> tabella -> Insert -> Import data from CSV).
# Legge:  riferimenti/articoli-export.json  e  riferimenti/fornitori/fornitori-da-screenshot.csv
# Scrive: riferimenti/import/articoli.csv   e  riferimenti/import/fornitori.csv   (dati reali: restano sul PC)
# Nota: PowerShell 5 legge questo file come ANSI, quindi niente accenti nei testi.
$progetto = Split-Path $PSScriptRoot -Parent
$cartella = Join-Path $progetto "riferimenti\import"
New-Item -ItemType Directory -Force -Path $cartella | Out-Null
$utf8 = New-Object Text.UTF8Encoding $false
$it = [Globalization.CultureInfo]::InvariantCulture

function Campo($v) {
  $s = [string]$v
  if ($s -match '[",\r\n]') { return '"' + $s.Replace('"', '""') + '"' }
  return $s
}
function Numero($v) { return ([math]::Round([double]$v, 2)).ToString("0.00", $it) }

# ---------- Articoli ----------
# Aliquote: codici interni del gestionale attuale -> codici della tabella aliquote_iva.
# I due codici a 0% vanno per ora su "0" (Non assegnata): da correggere quando l'utente conferma quale aliquota sono.
$iva = @{
  "iva-22" = "22"
  "4570c2b4-387c-455a-aaa8-66d2079fa02c" = "04"
  "9bc97d64-62b7-408f-80f1-c6ce4e9cd0bf" = "0"
  "3c5611a4-41d9-4ee2-bc08-a9c19f79e4ad" = "0"
}
$dati = Get-Content (Join-Path $progetto "riferimenti\articoli-export.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$righe = New-Object Collections.Generic.List[string]
$righe.Add("codice,descrizione,barcode,aliquota_iva,costo_lordo,sconto,costo_netto,prezzo_vendita,prezzo_vendita_ivato,scorta_minima,anno_listino,id_vecchio")
$visti = @{}
$doppi = 0
foreach ($a in $dati.list) {
  $codice = ([string]$a.codice).Trim()
  if ($visti.ContainsKey($codice)) { $doppi++; continue }
  $visti[$codice] = $true
  $aliq = if ($a.aliquotaIVAId -and $iva.ContainsKey($a.aliquotaIVAId)) { $iva[$a.aliquotaIVAId] } else { "22" }
  $anno = if ([int]$a.annoListino -gt 0) { [int]$a.annoListino } else { "" }
  $righe.Add((@(
    (Campo $codice), (Campo ([string]$a.descrizione).Trim()), (Campo ([string]$a.barcode).Trim()), $aliq,
    (Numero $a.costoLordo), (Numero $a.sconto), (Numero $a.costoNetto), (Numero $a.prezzoVendita), (Numero $a.prezzoVenditaIvaInclusa),
    [int]$a.scortaMinima, $anno, $a.id
  ) -join ","))
}
[IO.File]::WriteAllLines((Join-Path $cartella "articoli.csv"), $righe, $utf8)

# ---------- Fornitori ----------
# Pulizia leggera: partite IVA fatte di soli zeri -> vuote; "IT" davanti tolto.
$forn = Import-Csv (Join-Path $progetto "riferimenti\fornitori\fornitori-da-screenshot.csv") -Delimiter ";" -Encoding UTF8
$righeF = New-Object Collections.Generic.List[string]
# La sede collegata (solo MAGAZZINO CENTRALE) si imposta dopo con database/02-dopo-import.sql:
# una cella vuota qui verrebbe letta come testo vuoto e non come "nessuna sede".
$righeF.Add("codice,ragione_sociale,partita_iva,codice_fiscale,aliquota_iva")
foreach ($f in $forn) {
  $piva = ($f.'Partita IVA' -replace '^IT\s*', '').Trim()
  if ($piva -notmatch '[1-9]') { $piva = "" }
  $cf = ($f.'Codice fiscale' -replace '^IT\s*', '').Trim()
  $righeF.Add((@((Campo $f.Codice), (Campo $f.'Ragione sociale'), (Campo $piva), (Campo $cf), [int]$f.IVA) -join ","))
}
[IO.File]::WriteAllLines((Join-Path $cartella "fornitori.csv"), $righeF, $utf8)

Write-Host ""
Write-Host " articoli.csv : $($righe.Count - 1) articoli (codici doppi saltati: $doppi)"
Write-Host " fornitori.csv: $($righeF.Count - 1) fornitori"
Write-Host " Cartella: $cartella"
Write-Host ""
