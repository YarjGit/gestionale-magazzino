-- IVA degli articoli (regola decisa il 22/10/2026):
--   22% per tutto, 4% per le ostie, 0% solo per i libri (IVA già pagata dall'editore, codici che iniziano con Q).
-- Il vecchio gestionale aveva a 0% anche 22 articoli che non sono libri (turibolo, talari, colletti, croci,
-- spilla, stellario, kit candele…): qui passano al 22%.
-- Il prezzo in etichetta (prezzo_vendita_ivato) NON cambia: si ricalcola solo il prezzo senza IVA.
-- Si può rieseguire: tocca solo gli articoli non libri ancora a 0%.

-- 1) Controllo prima: quali articoli cambiano (devono essere 22)
select codice, descrizione, aliquota_iva, prezzo_vendita_ivato
from articoli
where aliquota_iva in ('0', '--', '74') and codice not like 'Q%'
order by codice;

-- 2) Passano al 22%; prezzo senza IVA = prezzo in etichetta / 1,22 (al centesimo)
update articoli
set aliquota_iva = '22',
    prezzo_vendita = round(prezzo_vendita_ivato / 1.22, 2),
    modificato_il = now()
where aliquota_iva in ('0', '--', '74') and codice not like 'Q%';

-- 3) Controllo dopo (una riga sola): libri_a_zero = 49, altri_a_zero = 0, ostie_al_4 = 8
select
  count(*) filter (where aliquota_iva in ('0', '--', '74') and codice like 'Q%')     as libri_a_zero,
  count(*) filter (where aliquota_iva in ('0', '--', '74') and codice not like 'Q%') as altri_a_zero,
  count(*) filter (where aliquota_iva = '04')                                         as ostie_al_4,
  count(*) filter (where aliquota_iva = '22')                                         as al_22
from articoli;
