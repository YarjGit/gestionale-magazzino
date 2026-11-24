-- Scheda fornitore (fornitore.html, 24/11/2026): i campi che nel gestionale attuale ci sono e qui mancavano.
-- Indirizzo, CAP, città, provincia e telefono ci sono già (19-indirizzi-fornitori.sql). Si può rieseguire.

alter table fornitori add column if not exists nazione       text default 'Italia';
alter table fornitori add column if not exists cellulare     text;
alter table fornitori add column if not exists email         text;
alter table fornitori add column if not exists modificato_il timestamptz;

-- Controllo: deve dare 4 righe
select column_name from information_schema.columns
where table_name = 'fornitori' and column_name in ('nazione', 'cellulare', 'email', 'modificato_il');
