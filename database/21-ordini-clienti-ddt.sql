-- Ordini da clienti e DDT (deciso con l'utente il 18/11/2026).
-- Nel gestionale attuale il DDT usciva intestato al "Fornitore" scritto nell'ordine invece che al cliente:
-- qui l'ordine da cliente ha solo il cliente, e il DDT si intesta sempre a lui ("DA CONSEGNARE A").
-- Si può rieseguire.

-- 1) Indirizzo del cliente, stampato nel riquadro "DA CONSEGNARE A" del DDT
alter table clienti add column if not exists indirizzo text;
alter table clienti add column if not exists cap       text;
alter table clienti add column if not exists provincia text;

-- 2) Dati della spedizione stampati sul DDT (numero e data bolla, porto, corriere e tracking esistono già)
alter table movimenti add column if not exists colli     integer;
alter table movimenti add column if not exists peso      numeric(10,2);
alter table movimenti add column if not exists contenuto text;      -- "colli contenenti …", es. ARREDI SACRI

-- Controllo: deve dare una riga con tutti e tre true
select
  exists (select 1 from information_schema.columns where table_name = 'clienti' and column_name = 'indirizzo') as clienti_ok,
  exists (select 1 from information_schema.columns where table_name = 'movimenti' and column_name = 'colli') as movimenti_ok,
  exists (select 1 from information_schema.tables where table_name = 'clienti') as tabella_ok;
