-- Collega ogni articolo al suo fornitore leggendo il codice articolo.
-- Regole (confermate dal magazzino):
--   * codici SENZA slash = prodotti nostri -> fornitore "Produzione propria";
--   * codici CON lo slash: il numero prima dello slash finisce con il codice del fornitore,
--     le cifre davanti indicano altro. Es. A014/597/C -> 4 = Calandrini, D15319/0AL -> 319 = Graziani.
--     Se più codici fornitore corrispondono alla fine del numero, vince il più lungo (R05188 -> 188, non 88 o 8).
--   * eccezioni: codici con lo slash che sono prodotti nostri (es. A0110/… calici in ceramica "Tutto a tutti").
-- Tocca solo gli articoli ancora senza fornitore: si può rieseguire dopo aver aggiunto fornitori.

-- 1) Il "fornitore" per i prodotti nostri
insert into fornitori (codice, ragione_sociale)
values ('PROPRIA', 'Produzione propria')
on conflict (codice) do nothing;

-- 2) Prodotti nostri: codici senza slash + eccezioni
update articoli set fornitore_id = (select id from fornitori where codice = 'PROPRIA'), modificato_il = now()
where fornitore_id is null
  and (codice not like '%/%'
       or codice like 'A0110/%');

-- 3) Codici con lo slash: fornitore dalla fine del numero prima dello slash
with a as (
  select id, ltrim(substring(split_part(codice, '/', 1) from '(\d+)$'), '0') as num
  from articoli
  where fornitore_id is null and codice like '%/%'
), f as (
  select id, ltrim(codice, '0') as n from fornitori where ltrim(codice, '0') ~ '^\d+$'
), m as (
  select distinct on (a.id) a.id as articolo_id, f.id as fornitore_id
  from a join f on a.num like '%' || f.n
  order by a.id, length(f.n) desc
)
update articoli set fornitore_id = m.fornitore_id, modificato_il = now()
from m where articoli.id = m.articolo_id;

-- Controllo: quanti articoli per fornitore (la riga vuota = ancora senza fornitore)
select f.codice, f.ragione_sociale, count(*) as articoli
from articoli a left join fornitori f on f.id = a.fornitore_id
group by 1, 2
order by articoli desc;
