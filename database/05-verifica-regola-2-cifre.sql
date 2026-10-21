-- SOLO LETTURA: non modifica niente.
-- Prova della regola "le prime 2 cifre prima dello slash sono un prefisso, il resto è il fornitore"
-- (es. R09301 -> 301 Fontanini, D15319 -> 319 Graziani, A014 -> 4 Calandrini, R02188 -> 188 ALPA).
-- Mostra gli articoli che con questa regola cambierebbero fornitore rispetto a 04-collega-fornitori.sql:
-- "ora" = fornitore attuale, "nuovo" = fornitore con la regola delle 2 cifre.
with a as (
  select ar.codice, ar.descrizione, ar.fornitore_id,
         substring(split_part(ar.codice, '/', 1) from '(\d+)$') as cifre
  from articoli ar where ar.codice like '%/%' and ar.codice not like 'A0110/%'
), b as (
  select *, ltrim(case when length(cifre) >= 3 then substr(cifre, 3) else cifre end, '0') as nuovo
  from a where cifre is not null
)
select fa.ragione_sociale as ora, fb.ragione_sociale as nuovo, count(*) as articoli,
       min(b.codice || ' – ' || b.descrizione) as esempio_1, max(b.codice || ' – ' || b.descrizione) as esempio_2
from b
left join fornitori fa on fa.id = b.fornitore_id
left join fornitori fb on ltrim(fb.codice, '0') = b.nuovo
where fa.id is distinct from fb.id
group by 1, 2
order by articoli desc
limit 60;
