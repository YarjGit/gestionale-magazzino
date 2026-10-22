-- Gli articoli rimasti senza fornitore (234 dopo il file 08) sono tutti del Magazzino Centrale: confermato dall'utente il 22/10/2026.
-- Si può rieseguire: tocca solo gli articoli che non hanno ancora un fornitore.

update articoli
set fornitore_id = (select id from fornitori where codice = '900009'),   -- 900009 = MAGAZZINO CENTRALE
    fornitore_dedotto = false,
    modificato_il = now()
where fornitore_id is null;

-- Controllo (una riga sola): senza_fornitore deve essere 0
select
  count(*) filter (where fornitore_id is null) as senza_fornitore,
  count(*) filter (where fornitore_id = (select id from fornitori where codice = '900009')) as magazzino_centrale
from articoli;
