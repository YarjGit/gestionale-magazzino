# Converte l'export JSON degli articoli del gestionale attuale in prototipo/js/dati-articoli-reali.js.
# Quel file resta SOLO su questo PC (escluso da GitHub): il prototipo online continua a usare gli articoli di esempio.
# Uso: powershell -File strumenti\importa-articoli.ps1 [-Json percorso\export.json]
# Nota: PowerShell 5 legge questo file come ANSI, quindi niente accenti nei testi.
param([string]$Json = "")

$progetto = Split-Path $PSScriptRoot -Parent
if (-not $Json) { $Json = Join-Path $progetto "riferimenti\articoli-export.json" }
$uscita = Join-Path $progetto "prototipo\js\dati-articoli-reali.js"

$dati = Get-Content $Json -Raw -Encoding UTF8 | ConvertFrom-Json

# Aliquote: i codici interni riconosciuti dai prezzi (4% = ostie; 0% = libri liturgici e altri)
$iva = @{
  "iva-22" = 22
  "4570c2b4-387c-455a-aaa8-66d2079fa02c" = 4
  "9bc97d64-62b7-408f-80f1-c6ce4e9cd0bf" = 0
  "3c5611a4-41d9-4ee2-bc08-a9c19f79e4ad" = 0
}

$articoli = foreach ($a in $dati.list) {
  [ordered]@{
    codice  = $a.codice
    descr   = $a.descrizione
    giac    = $null                                   # le giacenze non sono nell'export
    costo   = [math]::Round([double]$a.costoNetto, 2)
    prezzo  = [math]::Round([double]$a.prezzoVenditaIvaInclusa, 2)
    barcode = [string]$a.barcode
    forn    = -1                                      # il fornitore e' un codice interno: serve l'export dei fornitori
    prov    = "CAL SMM Roma"
    iva     = $(if ($a.aliquotaIVAId -and $iva.ContainsKey($a.aliquotaIVAId)) { $iva[$a.aliquotaIVAId] } else { 22 })  # senza aliquota: 22
    importato = [bool]$a.listinoExcel
    anno    = [int]$a.annoListino
    scorta  = [int]$a.scortaMinima
  }
}

$js = "// GENERATO da strumenti/importa-articoli.ps1 il $(Get-Date -Format 'yyyy-MM-dd HH:mm') - dati reali, NON caricare su GitHub.`n" +
      "// $($articoli.Count) articoli esportati il $($dati.dateExport)`n" +
      "const ARTICOLI_REALI = " + ($articoli | ConvertTo-Json -Compress -Depth 3) + ";`n"
[IO.File]::WriteAllText($uscita, $js, (New-Object Text.UTF8Encoding $false))

Write-Host ""
Write-Host " Articoli convertiti: $($articoli.Count)"
Write-Host " File: $uscita ($([math]::Round((Get-Item $uscita).Length / 1KB)) KB)"
Write-Host ""
