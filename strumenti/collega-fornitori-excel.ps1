# Collega ogni articolo al suo fornitore partendo dall'export Excel del gestionale attuale
# (Articoli con le colonne "Fornitore 1" e "Fornitore 2").
# Uso:   powershell -ExecutionPolicy Bypass -File strumenti\collega-fornitori-excel.ps1 [percorso.xlsx]
# Legge: riferimenti/articoli-fornitori/articoli-fornitori.xlsx  e  riferimenti/import/fornitori.csv
# Scrive: riferimenti/import/08-fornitori-da-excel.sql  (dati reali: resta sul PC, si incolla nel SQL Editor di Supabase)
# Ordine delle regole:
#   1. il fornitore scritto nell'Excel (Fornitore 1, se manca Fornitore 2);
#   2. altrimenti il fornitore piu' frequente tra gli articoli della stessa famiglia (parte prima dello slash);
#   3. altrimenti la regola del numero: lettera + 2 cifre + codice fornitore (R09301 -> 301);
#   4. codici senza slash, calici A0110/ e patene A0210/ -> Magazzino Centrale (prodotti nostri).
# Le regole 2-4 sono deduzioni: l'articolo viene segnato con fornitore_dedotto = true ("da verificare").
# Nota: PowerShell 5 legge questo file come ANSI, quindi niente accenti nei testi.
param([string]$Excel)
$progetto = Split-Path $PSScriptRoot -Parent
if (-not $Excel) { $Excel = Join-Path $progetto "riferimenti\articoli-fornitori\articoli-fornitori.xlsx" }
$utf8 = New-Object Text.UTF8Encoding $false

# ---------- Lettura dell'Excel (un xlsx e' uno zip di file XML) ----------
$tmp = Join-Path $env:TEMP ("xlsx-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
Copy-Item $Excel "$tmp\file.zip"
Expand-Archive "$tmp\file.zip" "$tmp\x"
$stringhe = New-Object Collections.Generic.List[string]
[xml]$ss = [IO.File]::ReadAllText("$tmp\x\xl\sharedStrings.xml")
foreach ($si in $ss.sst.si) { $stringhe.Add($si.InnerText) }
[xml]$foglio = [IO.File]::ReadAllText("$tmp\x\xl\worksheets\sheet1.xml")
Remove-Item -Recurse -Force $tmp

function Colonna([string]$rif) { $n = 0; foreach ($c in ($rif -replace '\d', '').ToCharArray()) { $n = $n * 26 + ([int]$c - 64) }; $n - 1 }
$righe = foreach ($row in $foglio.worksheet.sheetData.row) {
  $celle = @{}
  foreach ($c in $row.c) {
    $v = $c.v
    if ($c.t -eq "s") { $v = $stringhe[[int]$v] } elseif ($c.t -eq "inlineStr") { $v = $c.is.InnerText }
    $celle[(Colonna $c.r)] = [string]$v
  }
  , $celle
}
$intest = $righe[0]
$col = @{}; foreach ($k in $intest.Keys) { $col[$intest[$k]] = $k }
foreach ($n in "Codice", "Fornitore 1", "Fornitore 2") { if (-not $col.ContainsKey($n)) { throw "Nell'Excel manca la colonna $n" } }

# ---------- Fornitori del database (per nome, spazi doppi ignorati) ----------
function Nome($t) { return ([string]$t -replace '\s+', ' ').Trim().ToUpper() }
$fornitori = Import-Csv (Join-Path $progetto "riferimenti\import\fornitori.csv") -Encoding UTF8
$perNome = @{}; $perNumero = @{}
foreach ($f in $fornitori) {
  $perNome[(Nome $f.ragione_sociale)] = $f.codice
  $n = $f.codice.TrimStart('0'); if ($n -match '^\d+$') { $perNumero[$n] = $f.codice }
}
$centrale = $perNome["MAGAZZINO CENTRALE"]

# ---------- Regola 1: Excel ----------
function Famiglia($codice) { return ($codice.Split('/')[0] -replace '[^A-Za-z0-9]', '').ToUpper() }
$articoli = New-Object Collections.Generic.List[object]
$sconosciuti = @{}
foreach ($r in ($righe | Select-Object -Skip 1)) {
  $codice = ([string]$r[$col["Codice"]]).Trim()
  if (-not $codice) { continue }
  $nome = $r[$col["Fornitore 1"]]; if (-not $nome) { $nome = $r[$col["Fornitore 2"]] }
  $forn = $null
  if ($nome) { $forn = $perNome[(Nome $nome)]; if (-not $forn) { $sconosciuti[(Nome $nome)] = 1 } }
  $articoli.Add([pscustomobject]@{ codice = $codice; fornitore = $forn; dedotto = $false })
}

# Famiglie: per ogni parte prima dello slash, quanti articoli per fornitore (solo dati dell'Excel)
$famiglie = @{}
foreach ($a in $articoli) {
  if (-not $a.fornitore -or $a.codice -notlike '*/*') { continue }
  $k = Famiglia $a.codice
  if (-not $famiglie[$k]) { $famiglie[$k] = @{} }
  $famiglie[$k][$a.fornitore] = 1 + [int]$famiglie[$k][$a.fornitore]
}

# ---------- Regole 2-4 per chi non ha fornitore nell'Excel ----------
$conta = @{ excel = 0; famiglia = 0; numero = 0; centrale = 0; nessuno = 0 }
foreach ($a in $articoli) {
  if ($a.fornitore) { $conta.excel++; continue }
  $c = $a.codice
  if ($c -like '*/*' -and $c -notlike 'A0110/*' -and $c -notlike 'A0210/*') {
    $fam = $famiglie[(Famiglia $c)]
    if ($fam) {
      $a.fornitore = ($fam.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1).Key
      $a.dedotto = $true; $conta.famiglia++; continue
    }
    if ($c -notlike 'R029/*' -and $c.Split('/')[0] -match '(\d+)$' -and $matches[1].Length -ge 3) {
      $f = $perNumero[$matches[1].Substring(2).TrimStart('0')]
      if ($f) { $a.fornitore = $f; $a.dedotto = $true; $conta.numero++; continue }
    }
    $conta.nessuno++
  } else {
    $a.fornitore = $centrale; $a.dedotto = $true; $conta.centrale++
  }
}

# ---------- SQL ----------
function Testo($v) { if ($null -eq $v) { return "null" }; return "'" + $v.Replace("'", "''") + "'" }
$sql = New-Object Text.StringBuilder
[void]$sql.AppendLine("-- Collegamento articoli -> fornitori dall'export Excel del gestionale attuale (generato da strumenti/collega-fornitori-excel.ps1).")
[void]$sql.AppendLine("-- Sostituisce 07-collega-fornitori-definitivo.sql. Si puo' rieseguire: riparte ogni volta da zero.")
[void]$sql.AppendLine("-- Excel: $($conta.excel) articoli. Dedotti (da verificare): famiglia $($conta.famiglia), numero $($conta.numero), Magazzino Centrale $($conta.centrale). Senza fornitore: $($conta.nessuno).")
[void]$sql.AppendLine("")
[void]$sql.AppendLine("alter table articoli add column if not exists fornitore_dedotto boolean not null default false;")
[void]$sql.AppendLine("comment on column articoli.fornitore_dedotto is 'Fornitore dedotto dal codice articolo (non scritto nel gestionale attuale): da verificare';")
[void]$sql.AppendLine("")
[void]$sql.AppendLine("drop table if exists excel;")
[void]$sql.AppendLine("create temporary table excel (codice text, fornitore text, dedotto boolean);")
for ($i = 0; $i -lt $articoli.Count; $i += 1000) {
  $blocco = $articoli[$i..([math]::Min($i + 999, $articoli.Count - 1))] |
    ForEach-Object { "  (" + (Testo $_.codice) + ", " + (Testo $_.fornitore) + ", " + $(if ($_.dedotto) { "true" } else { "false" }) + ")" }
  [void]$sql.AppendLine("insert into excel (codice, fornitore, dedotto) values")
  [void]$sql.AppendLine(($blocco -join ",`n") + ";")
}
[void]$sql.AppendLine(@"

update articoli set fornitore_id = null, fornitore_dedotto = false
where fornitore_id is not null or fornitore_dedotto;

update articoli a set fornitore_id = f.id, fornitore_dedotto = e.dedotto, modificato_il = now()
from excel e join fornitori f on f.codice = e.fornitore
where trim(a.codice) = e.codice;

-- "Produzione propria" (creato a mano prima dell'Excel): ora i prodotti nostri sono di Magazzino Centrale
delete from fornitori f where f.codice = 'PROPRIA'
  and not exists (select 1 from articoli where fornitore_id = f.id)
  and not exists (select 1 from movimenti where fornitore_id = f.id);

-- Controllo (una riga sola): deve dare excel = $($conta.excel), dedotti = $($conta.famiglia + $conta.numero + $conta.centrale), articoli_non_trovati = 0
select
  count(*) filter (where a.fornitore_id is not null and not a.fornitore_dedotto) as excel,
  count(*) filter (where a.fornitore_dedotto) as dedotti,
  count(*) filter (where a.fornitore_id is null) as senza_fornitore,
  (select count(*) from excel e where not exists (select 1 from articoli x where trim(x.codice) = e.codice)) as articoli_non_trovati,
  (select count(*) from excel e where e.fornitore is not null and not exists (select 1 from fornitori x where x.codice = e.fornitore)) as fornitori_non_trovati
from articoli a;
"@)
$uscita = Join-Path $progetto "riferimenti\import\08-fornitori-da-excel.sql"
[IO.File]::WriteAllText($uscita, $sql.ToString(), $utf8)

"Excel: $($conta.excel)  famiglia: $($conta.famiglia)  numero: $($conta.numero)  Magazzino Centrale: $($conta.centrale)  senza: $($conta.nessuno)"
if ($sconosciuti.Count) { "Fornitori dell'Excel non trovati nel database: " + ($sconosciuti.Keys -join "; ") }
"Scritto: $uscita"
