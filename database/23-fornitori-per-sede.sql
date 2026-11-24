-- Fornitori per sede (24/11/2026): come nel gestionale attuale ogni sede ha il SUO elenco di fornitori,
-- ma l'anagrafica resta una sola (un fornitore usato da più sedi non si scrive due volte).
-- Ogni riga dice: questo fornitore lo usa questa sede. Carichi, ordini, scheda articolo e l'elenco Fornitori
-- mostrano solo i fornitori della sede di lavoro. Si può rieseguire.
-- Dopo questo file va eseguito riferimenti/import/25-fornitori-per-sede.sql (gli elenchi veri di ogni sede, solo sul PC di lavoro).

create table if not exists fornitori_sedi (
  fornitore_id uuid not null references fornitori(id) on delete cascade,
  sede_id      text not null references sedi(id) on delete cascade,
  creato_il    timestamptz not null default now(),
  primary key (fornitore_id, sede_id)
);
create index if not exists fornitori_sedi_sede on fornitori_sedi (sede_id);

alter table fornitori_sedi enable row level security;
drop policy if exists solo_autorizzati on fornitori_sedi;
create policy solo_autorizzati on fornitori_sedi for all to authenticated using (e_autorizzato()) with check (e_autorizzato());

-- Controllo: deve dare 1
select count(*) from information_schema.tables where table_name = 'fornitori_sedi';
