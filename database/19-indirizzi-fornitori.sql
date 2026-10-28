-- Indirizzo e telefono dei fornitori (28/10/2026): servono nella stampa di carichi e ordini, in alto a destra come nel gestionale attuale.
-- Si possono riempire a mano dalla tabella fornitori di Supabase (Table Editor) finché non c'è la scheda fornitore.
-- Si può rieseguire.

alter table fornitori add column if not exists indirizzo text;
alter table fornitori add column if not exists cap       text;
alter table fornitori add column if not exists citta     text;
alter table fornitori add column if not exists provincia text;
alter table fornitori add column if not exists telefono  text;

-- Magazzino Centrale (fornitore 900009): indirizzo come nella stampa dell'ordine del gestionale attuale (solo se ancora vuoto)
update fornitori set indirizzo = 'Via Portuense, 739', cap = '00148', citta = 'Roma', provincia = 'RM', telefono = '0665656224'
where codice = '900009' and indirizzo is null;

-- Controllo: deve dare 5 colonne e l'indirizzo del Magazzino Centrale
select (select count(*) from information_schema.columns
        where table_name = 'fornitori' and column_name in ('indirizzo', 'cap', 'citta', 'provincia', 'telefono')) as colonne_nuove,
       (select indirizzo || ', ' || cap || ' ' || citta from fornitori where codice = '900009') as magazzino_centrale;
