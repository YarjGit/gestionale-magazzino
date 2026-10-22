# Prepara il file SQL con le giacenze iniziali prese dal gestionale attuale (pagina Giacenze, una per sede).
# Legge:  riferimenti/giacenze/giacenze-smm.txt e riferimenti/giacenze/giacenze-magazzino-centrale.txt
#         (righe "codice|quantita totale|anno:quantita:costo;...|descrizione|barcode", le ultime due solo per Magazzino Centrale)
# Scrive: riferimenti/import/13-giacenze-iniziali.sql  (dati reali: resta sul PC, si incolla nel SQL Editor di Supabase)
# Ogni lotto (sede, anno di acquisto) diventa un movimento "esistenza" Definitivo datato 1 gennaio di quell'anno:
# cosi' la giacenza nasce gia' divisa per anno di acquisto, con il costo di ogni lotto.
# Nota: PowerShell 5 legge questo file come ANSI, quindi niente accenti nei testi.
$progetto = Split-Path $PSScriptRoot -Parent
$cartella = Join-Path $progetto "riferimenti\giacenze"
$utf8 = New-Object Text.UTF8Encoding $false
$it = [Globalization.CultureInfo]::InvariantCulture
$annoInCorso = (Get-Date).Year

function Testo($v) { if ($null -eq $v -or "$v" -eq "") { return "null" }; return "'" + "$v".Replace("'", "''") + "'" }
function Numero($v) { if ("$v" -eq "") { return "null" }; return ([double]::Parse("$v", $it)).ToString($it) }

$valori = New-Object Collections.Generic.List[string]
$scartate = New-Object Collections.Generic.List[string]
foreach ($sede in @(@{ id = "cal-smm-roma"; file = "giacenze-smm.txt" }, @{ id = "magazzino-centrale"; file = "giacenze-magazzino-centrale.txt" })) {
  foreach ($riga in Get-Content (Join-Path $cartella $sede.file) -Encoding UTF8) {
    if (-not $riga -or $riga.StartsWith("#")) { continue }
    $p = $riga -split "\|"
    $codice = $p[0].Trim()
    if (-not $codice) { $scartate.Add("$($sede.id): $riga"); continue }
    $descr = if ($p.Count -gt 3) { $p[3].Trim() } else { "" }
    $barcode = if ($p.Count -gt 4) { $p[4].Trim() } else { "" }
    # lotti "anno:quantita:costo"; senza lotti la quantita totale va sull'anno in corso
    $lotti = if ($p[2]) { $p[2] -split ";" } else { @("$annoInCorso`:$($p[1]):") }
    foreach ($l in $lotti) {
      $x = $l -split ":"
      if ([double]::Parse($x[1], $it) -eq 0) { continue }
      $valori.Add("  ($(Testo $sede.id), $(Testo $codice), $($x[0]), $(Numero $x[1]), $(Numero $x[2]), $(Testo $descr), $(Testo $barcode))")
    }
  }
}

$sql = @"
-- Giacenze iniziali di CAL SMM Roma e Magazzino Centrale dal gestionale attuale (generato da strumenti/importa-giacenze.ps1).
-- Lotti per anno di acquisto: $($valori.Count). Righe scartate perche' senza codice articolo: $($scartate.Count).
-- Si puo' rieseguire: prima toglie le giacenze iniziali importate in precedenza.

-- 1) Le quantita' possono avere i decimali (es. metri di stoffa): la colonna diventa numerica.
--    La vista delle giacenze e il totale di riga dipendono dalla colonna: si tolgono e si rimettono.
drop view if exists giacenze;
alter table movimenti_righe drop column if exists totale;
alter table movimenti_righe alter column quantita type numeric(12,2);
alter table movimenti_righe add column totale numeric(12,2) generated always as (round(quantita * prezzo * (1 - sconto / 100), 2)) stored;
create or replace view giacenze as
with variazioni as (
  select m.sede_id, r.articolo_id, r.quantita * t.segno as pezzi
  from movimenti_righe r
  join movimenti m on m.id = r.movimento_id
  join tipi_movimento t on t.codice = m.tipo
  where m.stato in ('Definitivo', 'Evaso')
  union all
  select m.sede_altra_id, r.articolo_id, r.quantita
  from movimenti_righe r
  join movimenti m on m.id = r.movimento_id
  where m.tipo = 'trasferimento_a_filiale' and m.stato in ('Definitivo', 'Evaso') and m.sede_altra_id is not null
)
select sede_id, articolo_id, sum(pezzi)::numeric(12,2) as quantita
from variazioni
group by sede_id, articolo_id;
alter view giacenze set (security_invoker = on);
grant select on giacenze to authenticated;

-- 2) I lotti letti dal gestionale attuale
drop table if exists import_giacenze;
create temporary table import_giacenze (sede text, codice text, anno int, quantita numeric(12,2), costo numeric(12,2), descrizione text, barcode text);
"@
$sb = New-Object Text.StringBuilder $sql
for ($i = 0; $i -lt $valori.Count; $i += 1000) {
  [void]$sb.AppendLine("insert into import_giacenze (sede, codice, anno, quantita, costo, descrizione, barcode) values")
  [void]$sb.AppendLine(($valori[$i..([math]::Min($i + 999, $valori.Count - 1))] -join ",`n") + ";")
}
[void]$sb.AppendLine(@"

-- 3) Articoli che esistono solo nell'archivio del Magazzino Centrale: si aggiungono (fornitore Magazzino Centrale)
insert into articoli (codice, descrizione, barcode, fornitore_id, aliquota_iva, costo_lordo, costo_netto)
select distinct on (i.codice) i.codice, coalesce(nullif(i.descrizione, ''), i.codice), nullif(i.barcode, ''),
       (select id from fornitori where codice = '900009'), '22', coalesce(i.costo, 0), coalesce(i.costo, 0)
from import_giacenze i
where not exists (select 1 from articoli a where a.codice = i.codice)
order by i.codice, i.anno desc;

-- 4) Via le giacenze iniziali importate prima (se il file viene rieseguito)
delete from movimenti where tipo = 'esistenza' and causale like 'Giacenza iniziale dal gestionale precedente%';

-- 5) Un movimento "esistenza" Definitivo per ogni sede e anno di acquisto, datato 1 gennaio di quell'anno
insert into movimenti (tipo, stato, sede_id, data_movimento, causale, creato_da)
select distinct 'esistenza', 'Definitivo', sede, make_date(anno, 1, 1), 'Giacenza iniziale dal gestionale precedente, anno ' || anno, 'import'
from import_giacenze;

insert into movimenti_righe (movimento_id, articolo_id, quantita, prezzo, etichette)
select m.id, a.id, i.quantita, coalesce(i.costo, a.costo_netto, 0), 0
from import_giacenze i
join articoli a on a.codice = i.codice
join movimenti m on m.tipo = 'esistenza' and m.sede_id = i.sede and m.data_movimento = make_date(i.anno, 1, 1)
                and m.causale like 'Giacenza iniziale dal gestionale precedente%';

-- 6) Controllo (una riga per sede): articoli e pezzi in giacenza
select g.sede_id, count(*) filter (where g.quantita <> 0) as articoli, sum(g.quantita) as pezzi
from giacenze g
group by g.sede_id
order by g.sede_id;
"@)
$uscita = Join-Path $progetto "riferimenti\import\13-giacenze-iniziali.sql"
[IO.File]::WriteAllText($uscita, $sb.ToString(), $utf8)
"Lotti: $($valori.Count)  scartate (senza codice): $($scartate.Count)"
$scartate | ForEach-Object { "  scartata: $_" }
"Scritto: $uscita"
