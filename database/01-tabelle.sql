-- =====================================================================
-- Gestionale Magazzino – tabelle del database (Supabase / PostgreSQL)
-- Da incollare una volta nell'editor SQL di Supabase ("SQL Editor" → "New query" → Run).
-- I prezzi sono numeric(12,2): il database li arrotonda sempre a due decimali.
-- =====================================================================

-- ---------- Sedi ----------
create table if not exists sedi (
  id          text primary key,              -- es. 'cal-smm-roma'
  nome        text not null unique,
  gruppo      text not null,                 -- Negozi CAL / Laboratori e magazzino / Altri punti vendita
  colore      text,                          -- colore del tasto sede, es. '#d4009c'
  attiva      boolean not null default false,
  codice      text,
  citta       text,
  indirizzo   text,
  email       text
);

-- ---------- Aliquote IVA ----------
create table if not exists aliquote_iva (
  codice       text primary key,             -- '22', '04', '74', '--' …
  descrizione  text not null,
  aliquota     numeric(5,2) not null default 0,
  applicazione text,                         -- 'A' / 'C' come nel gestionale attuale
  id_vecchio   text unique                   -- codice interno del gestionale attuale (es. 'iva-22')
);

-- ---------- Fornitori ----------
create table if not exists fornitori (
  id               uuid primary key default gen_random_uuid(),
  codice           text not null unique,
  ragione_sociale  text not null,
  partita_iva      text,
  codice_fiscale   text,
  aliquota_iva     numeric(5,2) default 0,
  sede_collegata   text references sedi(id),
  note             text,
  id_vecchio       uuid unique,              -- id del gestionale attuale, per collegare gli articoli
  creato_il        timestamptz not null default now()
);

-- ---------- Clienti ----------
create table if not exists clienti (
  id               uuid primary key default gen_random_uuid(),
  codice           text not null unique,
  nome             text not null,
  tipo             text,                     -- Negozio, Parrocchia, Istituto…
  codice_fiscale   text,
  partita_iva      text,
  email            text,
  telefono         text,
  citta            text,
  nazione          text default 'Italia',
  id_vecchio       uuid unique,
  creato_il        timestamptz not null default now()
);

-- ---------- Articoli ----------
create table if not exists articoli (
  id                    uuid primary key default gen_random_uuid(),
  codice                text not null unique,
  descrizione           text not null,
  barcode               text,
  fornitore_id          uuid references fornitori(id),
  aliquota_iva          text references aliquote_iva(codice) default '22',
  costo_lordo           numeric(12,2) not null default 0,
  sconto                numeric(5,2)  not null default 0,
  costo_netto           numeric(12,2) not null default 0,
  prezzo_vendita        numeric(12,2) not null default 0,   -- senza IVA
  prezzo_vendita_ivato  numeric(12,2) not null default 0,   -- quello sull'etichetta
  scorta_minima         integer not null default 0,
  anno_listino          integer,
  attivo                boolean not null default true,
  id_vecchio            uuid unique,
  creato_il             timestamptz not null default now(),
  modificato_il         timestamptz not null default now()
);
create index if not exists articoli_barcode on articoli (barcode);   -- ricerca con la pistola

-- ---------- Movimenti (carichi, ordini, trasferimenti, vendite, rettifiche…) ----------
-- tipo: uno dei tipi di movimento; segno sulla giacenza della sede:
--   +1 entra merce, -1 esce merce, 0 non tocca la giacenza (ordini, preventivi)
create table if not exists tipi_movimento (
  codice  text primary key,                 -- es. 'carico_fornitore'
  nome    text not null,                    -- es. 'Carico da Fornitore'
  segno   smallint not null check (segno in (-1, 0, 1))
);

create table if not exists movimenti (
  id                 bigint generated always as identity primary key,
  tipo               text not null references tipi_movimento(codice),
  stato              text not null default 'Provvisorio'
                     check (stato in ('Provvisorio', 'Definitivo', 'Riordino', 'Evaso', 'Annullato')),
  sede_id            text not null references sedi(id),          -- sede che fa il movimento
  sede_altra_id      text references sedi(id),                   -- trasferimenti: sede di arrivo / partenza
  fornitore_id       uuid references fornitori(id),
  cliente_id         uuid references clienti(id),
  protocollo         text,                                       -- es. '2026-000184'
  numero_documento   text,                                       -- numero bolla / DDT del fornitore
  data_movimento     date not null default current_date,
  data_documento     date,
  data_bolla         date,
  causale            text,                                       -- non stampata
  annotazioni        text,                                       -- stampate sul documento
  porto              text,
  condizione_pagamento text,
  spedizioniere      text,
  tracking           text,
  spese              numeric(12,2) not null default 0,
  ordine_collegato_id bigint references movimenti(id),           -- carico nato da un ordine
  creato_da          text,                                       -- email di chi l'ha creato
  creato_il          timestamptz not null default now(),
  modificato_il      timestamptz not null default now()
);
create index if not exists movimenti_sede_tipo on movimenti (sede_id, tipo, data_movimento desc);

create table if not exists movimenti_righe (
  id                 bigint generated always as identity primary key,
  movimento_id       bigint not null references movimenti(id) on delete cascade,
  articolo_id        uuid not null references articoli(id),
  quantita_ordinata  integer,                                    -- solo se collegato a un ordine
  quantita           integer not null default 0,                 -- quantità arrivata / venduta / trasferita
  prezzo             numeric(12,2) not null default 0,
  sconto             numeric(5,2)  not null default 0,
  etichette          integer not null default 0,
  totale             numeric(12,2) generated always as
                       (round(quantita * prezzo * (1 - sconto / 100), 2)) stored
);
create index if not exists righe_movimento on movimenti_righe (movimento_id);
create index if not exists righe_articolo on movimenti_righe (articolo_id);

-- ---------- Giacenze: calcolate dai movimenti definitivi ----------
-- Ogni riga di un movimento Definitivo/Evaso aggiunge o toglie pezzi nella sede del movimento;
-- i trasferimenti a filiale aggiungono anche nella sede di arrivo.
create or replace view giacenze as
with variazioni as (
  select m.sede_id, r.articolo_id, r.quantita * t.segno as pezzi
  from movimenti_righe r
  join movimenti m on m.id = r.movimento_id
  join tipi_movimento t on t.codice = m.tipo
  where m.stato in ('Definitivo', 'Evaso')
  union all
  select m.sede_altra_id, r.articolo_id, r.quantita
  from movimenti_righe r
  join movimenti m on m.id = r.movimento_id
  where m.tipo = 'trasferimento_a_filiale' and m.stato in ('Definitivo', 'Evaso') and m.sede_altra_id is not null
)
select sede_id, articolo_id, sum(pezzi)::integer as quantita
from variazioni
group by sede_id, articolo_id;

-- ---------- Chi può entrare ----------
-- Solo le email elencate qui possono vedere e modificare i dati (accesso con Google).
create table if not exists utenti_autorizzati (
  email   text primary key,
  nome    text,
  ruolo   text not null default 'operatore' check (ruolo in ('amministratore', 'operatore')),
  sedi    text[] not null default '{}'            -- sedi in cui lavora di solito (solo informativo)
);
-- Scelta dell'utente: ogni sede vede prodotti e movimenti di tutte le altre, senza limitazioni.
-- Le regole qui sotto controllano solo CHI entra, non quale sede guarda.

create or replace function e_autorizzato() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from utenti_autorizzati where email = auth.jwt() ->> 'email');
$$;

-- Sicurezza (Row Level Security): tutte le tabelle chiuse a chiave, aperte solo agli utenti autorizzati
alter table sedi               enable row level security;
alter table aliquote_iva       enable row level security;
alter table fornitori          enable row level security;
alter table clienti            enable row level security;
alter table articoli           enable row level security;
alter table tipi_movimento     enable row level security;
alter table movimenti          enable row level security;
alter table movimenti_righe    enable row level security;
alter table utenti_autorizzati enable row level security;

create policy solo_autorizzati on sedi               for all to authenticated using (e_autorizzato()) with check (e_autorizzato());
create policy solo_autorizzati on aliquote_iva       for all to authenticated using (e_autorizzato()) with check (e_autorizzato());
create policy solo_autorizzati on fornitori          for all to authenticated using (e_autorizzato()) with check (e_autorizzato());
create policy solo_autorizzati on clienti            for all to authenticated using (e_autorizzato()) with check (e_autorizzato());
create policy solo_autorizzati on articoli           for all to authenticated using (e_autorizzato()) with check (e_autorizzato());
create policy solo_autorizzati on tipi_movimento     for all to authenticated using (e_autorizzato()) with check (e_autorizzato());
create policy solo_autorizzati on movimenti          for all to authenticated using (e_autorizzato()) with check (e_autorizzato());
create policy solo_autorizzati on movimenti_righe    for all to authenticated using (e_autorizzato()) with check (e_autorizzato());
create policy solo_autorizzati on utenti_autorizzati for all to authenticated using (e_autorizzato()) with check (e_autorizzato());

alter view giacenze set (security_invoker = on);

-- Permessi: gli utenti che hanno fatto l'accesso possono usare le tabelle (le regole qui sopra decidono chi).
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function e_autorizzato() to authenticated;
-- I visitatori senza accesso (anon) non hanno nessuna regola che li lasci passare: non vedono niente.

-- ---------- Dati di base ----------
insert into tipi_movimento (codice, nome, segno) values
  ('carico_fornitore',        'Carico da Fornitore',       1),
  ('ordine_fornitore',        'Ordine a Fornitore',        0),
  ('trasferimento_da_filiale','Trasferimento da Filiale',  1),
  ('reso_da_cliente',         'Reso da Cliente',           1),
  ('aumento_giacenza',        'Aumento Giacenza',          1),
  ('altro_carico',            'Altro Carico',              1),
  ('vendite_giornaliere',     'Vendite Giornaliere',      -1),
  ('scarico_cliente',         'Scarico a Cliente',        -1),
  ('ordine_cliente',          'Ordine da Cliente',         0),
  ('reso_a_fornitore',        'Reso a Fornitore',         -1),
  ('trasferimento_a_filiale', 'Trasferimento a Filiale',  -1),
  ('preventivo',              'Preventivo',                0),
  ('diminuzione_giacenza',    'Diminuzione Giacenza',     -1),
  ('altro_scarico',           'Altro Scarico',            -1),
  ('esistenza',               'Esistenza (inventario)',    1)
on conflict (codice) do nothing;

insert into aliquote_iva (codice, descrizione, aliquota, applicazione, id_vecchio) values
  ('22', 'Aliquota 22%',                  22, 'A', 'iva-22'),
  ('--', 'Non assegnata',                  0, 'C', null),
  ('0',  'Non assegnata',                  0, 'A', null),
  ('04', 'Aliquota 4%',                    4, 'A', '4570c2b4-387c-455a-aaa8-66d2079fa02c'),
  ('41', 'N.I. art.41 D.L. 331/93',        0, 'C', null),
  ('72', 'Art.72 DPR 633/72',              0, 'C', null),
  ('74', 'Art.74 DPR 633/72',              0, 'A', null),
  ('08', 'N.I. art. 8c DPR 633/72',        0, 'C', null),
  ('71', 'N.I. art.71 DPR 633/72',         0, 'C', null),
  ('81', 'N.I. art.8 lett.a DPR 633/72',   0, 'C', null),
  ('82', 'N.I. art.8 lett.b DPR 633/72',   0, 'C', null),
  ('38', 'Art.38 quater DPR 633/72',       0, 'C', null)
on conflict (codice) do nothing;

insert into sedi (id, nome, gruppo, colore, attiva) values
  ('cal-bari', 'CAL Bari', 'Negozi CAL', '#ffc0cb', false),
  ('cal-cagliari', 'CAL Cagliari', 'Negozi CAL', '#ffff00', false),
  ('cal-zugliano', 'CAL Centrale di Zugliano', 'Negozi CAL', '#a52a2a', false),
  ('cal-cinisello', 'CAL Cinisello Balsamo', 'Negozi CAL', '#ffa500', false),
  ('cal-firenze', 'CAL Firenze', 'Negozi CAL', '#0000ff', false),
  ('cal-milano', 'CAL Milano', 'Negozi CAL', '#00d02a', false),
  ('cal-palermo', 'CAL Palermo', 'Negozi CAL', '#40e0d0', false),
  ('cal-roma-estero', 'CAL Roma per Estero', 'Negozi CAL', '#eaff6a', false),
  ('cal-sede-roma', 'CAL Sede di Roma', 'Negozi CAL', '#2f4f4f', false),
  ('cal-smm-roma', 'CAL SMM Roma', 'Negozi CAL', '#d4009c', true),
  ('magazzino-centrale', 'Magazzino Centrale', 'Laboratori e magazzino', '#990000', true),
  ('lab-ceramiche', 'Laboratorio Ceramiche', 'Laboratori e magazzino', '#808000', false),
  ('lab-sede-centrale', 'Laboratori Sede Centrale', 'Laboratori e magazzino', null, false),
  ('lab-cinisello', 'Laboratorio Cinisello Balsamo', 'Laboratori e magazzino', null, false),
  ('lab-confezione', 'Laboratorio Confezione Sede Centrale', 'Laboratori e magazzino', null, false),
  ('libreria-caliendo', 'Libreria Caliendo', 'Altri punti vendita', null, false),
  ('negozio-flm', 'Negozio Basilica Papale di San Paolo fuori le Mura - FLM', 'Altri punti vendita', null, false)
on conflict (id) do nothing;
