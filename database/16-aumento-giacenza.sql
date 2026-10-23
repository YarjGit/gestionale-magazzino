-- Aumento giacenza (deciso con l'utente il 23/10/2026): merce ritrovata all'inventario, arrivata da altri centri
-- o da sedi chiuse, donata. Entra nella giacenza della sede come un carico, ma senza fornitore.
-- - motivo: perché la merce entra (Inventario, Da altri centri / sedi chiuse, Donazione, Altro)
-- - anno_acquisto: l'anno che si stampa sulle etichette; può essere un anno passato (es. merce vecchia ritrovata).
--   Vuoto = anno della data del movimento, come nei carichi.
-- Si può rieseguire.

alter table movimenti add column if not exists motivo text;
alter table movimenti add column if not exists anno_acquisto integer
  check (anno_acquisto is null or anno_acquisto between 1990 and 2100);

-- Controllo: deve dare una riga con due true
select
  exists (select 1 from information_schema.columns where table_name = 'movimenti' and column_name = 'motivo') as motivo_ok,
  exists (select 1 from information_schema.columns where table_name = 'movimenti' and column_name = 'anno_acquisto') as anno_ok;
