-- Indirizzo e telefono dei fornitori (28/10/2026): servono nella stampa dei carichi, in alto a destra come nel gestionale attuale.
-- Si possono riempire a mano dalla tabella fornitori di Supabase (Table Editor) finché non c'è la scheda fornitore.
-- Si può rieseguire.

alter table fornitori add column if not exists indirizzo text;
alter table fornitori add column if not exists cap       text;
alter table fornitori add column if not exists citta     text;
alter table fornitori add column if not exists provincia text;
alter table fornitori add column if not exists telefono  text;

-- Controllo: deve dare 5
select count(*) as colonne_nuove from information_schema.columns
where table_name = 'fornitori' and column_name in ('indirizzo', 'cap', 'citta', 'provincia', 'telefono');
