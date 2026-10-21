-- Collega ogni articolo al suo fornitore leggendo il codice articolo.
-- Regola (confermata dal magazzino): il numero prima dello slash finisce con il codice del fornitore,
-- le cifre davanti indicano altro. Es. A014/597/C -> 4 = Calandrini, D15319/0AL -> 319 = Graziani.
-- Se più codici fornitore corrispondono alla fine del numero, vince il più lungo (R05188 -> 188, non 88 o 8).
-- Solo i codici con lo slash: senza slash il numero finale è spesso una misura (es. "F071 110" = cotta 110 cm).
-- Tocca solo gli articoli ancora senza fornitore: si può rieseguire dopo aver aggiunto fornitori.
with a as (
  select id, ltrim(substring(split_part(codice, '/', 1) from '(\d+)$'), '0') as num
  from articoli
  where fornitore_id is null and codice like '%/%'
), f as (
  select id, ltrim(codice, '0') as n from fornitori where ltrim(codice, '0') <> ''
), m as (
  select distinct on (a.id) a.id as articolo_id, f.id as fornitore_id
  from a join f on a.num like '%' || f.n
  order by a.id, length(f.n) desc
)
update articoli set fornitore_id = m.fornitore_id, modificato_il = now()
from m where articoli.id = m.articolo_id;

-- Controllo: quanti articoli hanno ora un fornitore e quanti no
select count(fornitore_id) as con_fornitore, count(*) - count(fornitore_id) as senza_fornitore
from articoli;
