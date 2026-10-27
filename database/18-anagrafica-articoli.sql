-- Scheda articolo modificabile (deciso con l'utente il 27/10/2026): i campi della scheda del gestionale attuale
-- che mancavano nella tabella articoli. Il prezzo in etichetta resta prezzo_vendita_ivato; questi servono a rifare il calcolo.
-- Si può rieseguire.

alter table articoli add column if not exists fornitore2_id     uuid references fornitori(id);
alter table articoli add column if not exists provenienza       text;             -- Magazzino Centrale / Fornitori / Laboratorio
alter table articoli add column if not exists unita_misura      text;             -- Numero, Metri, Litri, Chili, Paia, Conf., Dozz.
alter table articoli add column if not exists tipologia         text;             -- Da magazzino / Da laboratorio / Servizio
alter table articoli add column if not exists categoria         text;
alter table articoli add column if not exists sottocategoria    text;
alter table articoli add column if not exists scaffale          text;
alter table articoli add column if not exists annotazioni       text;
alter table articoli add column if not exists ricarico          numeric(8,2);     -- %: 100 = prezzo doppio del costo
alter table articoli add column if not exists spese_confezione  numeric(12,2) not null default 0;
alter table articoli add column if not exists spese_imballaggio numeric(12,2) not null default 0;
alter table articoli add column if not exists spese_accessorie  numeric(12,2) not null default 0;
alter table articoli add column if not exists arrotondamento    numeric(12,2) not null default 0;

-- Controllo: deve dare 13
select count(*) as colonne_nuove from information_schema.columns
where table_name = 'articoli' and column_name in ('fornitore2_id', 'provenienza', 'unita_misura', 'tipologia', 'categoria', 'sottocategoria',
  'scaffale', 'annotazioni', 'ricarico', 'spese_confezione', 'spese_imballaggio', 'spese_accessorie', 'arrotondamento');
