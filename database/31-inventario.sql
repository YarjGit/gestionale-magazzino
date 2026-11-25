-- Inventario / Riallineamento giacenza (deciso con l'utente il 25/11/2026).
-- - Si apre un inventario (movimento "riallineamento" Provvisorio) per una sede: tutto il magazzino o solo una parte (colonna motivo).
-- - Si sparano i pezzi: le righe tengono i pezzi contati (quantita_contata) e, finché è provvisorio, quantita = 0 (la giacenza non cambia).
-- - Articoli non sparati (inventario di tutto il magazzino): si decide se lasciarli, modificarli o eliminarli (azione = 'elimina':
--   giacenza a zero in questa sede e articolo disattivato, se nelle altre sedi non ce n'è).
-- - Alla conferma (Definitivo) per ogni articolo contato: una riga toglie la giacenza di prima e una mette i pezzi contati sull'anno
--   in corso. Così la giacenza diventa quella contata, tutta nell'anno in corso, e la differenza resta registrata.
-- Si può rieseguire.

insert into tipi_movimento (codice, nome, segno) values ('riallineamento', 'Riallineamento giacenza (inventario)', 1)
on conflict (codice) do nothing;

alter table movimenti_righe add column if not exists quantita_contata numeric(12,2);
alter table movimenti_righe add column if not exists azione text;
alter table movimenti_righe drop constraint if exists azione_ammessa;
alter table movimenti_righe add constraint azione_ammessa check (azione is null or azione in ('elimina'));

-- Controllo: deve dare tipo_ok = true e colonne_ok = 2
select
  exists (select 1 from tipi_movimento where codice = 'riallineamento') as tipo_ok,
  (select count(*) from information_schema.columns where table_name = 'movimenti_righe' and column_name in ('quantita_contata', 'azione')) as colonne_ok;
