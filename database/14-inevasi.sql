-- Ordini delle filiali al Magazzino Centrale e INEVASI (deciso con l'utente il 22/10/2026).
-- - Una filiale (es. CAL SMM Roma) fa un Ordine a fornitore scegliendo un fornitore collegato a una sede
--   (es. MAGAZZINO CENTRALE → sede magazzino-centrale). Definitivo = ordine inviato.
-- - La sede che riceve l'ordine prepara un Trasferimento a filiale: ogni riga del trasferimento ricorda
--   quale riga d'ordine sta evadendo (ordine_riga_id).
-- - INEVASI = quantità ordinata − quantità già trasferita − quantità cancellata: si aggiornano da soli.
-- - Un inevaso si può cancellare (prodotto che non arriverà più): la cancellazione resta registrata.
-- Si può rieseguire.

-- 1) La riga del trasferimento ricorda la riga d'ordine che evade
alter table movimenti_righe add column if not exists ordine_riga_id bigint references movimenti_righe(id) on delete set null;
create index if not exists righe_ordine_riga on movimenti_righe (ordine_riga_id);

-- 2) Registro degli inevasi cancellati (resta visibile chi, quando, quanto e perché)
create table if not exists inevasi_annullati (
  id              bigint generated always as identity primary key,
  ordine_riga_id  bigint not null references movimenti_righe(id) on delete cascade,
  quantita        numeric(12,2) not null check (quantita > 0),
  motivo          text,
  annullato_da    text,
  annullato_il    timestamptz not null default now()
);
alter table inevasi_annullati enable row level security;
drop policy if exists solo_autorizzati on inevasi_annullati;
create policy solo_autorizzati on inevasi_annullati for all to authenticated using (e_autorizzato()) with check (e_autorizzato());
grant select, insert, update, delete on inevasi_annullati to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- 3) Vista degli inevasi: una riga per ogni riga d'ordine verso una sede (non provvisorio, non annullato)
--    stato_ordine Definitivo = ordine arrivato e ancora da preparare; Evaso = già preparato, il residuo è inevaso
create or replace view inevasi as
select r.id                                   as ordine_riga_id,
       m.id                                   as ordine_id,
       m.protocollo,
       m.data_movimento                       as data_ordine,
       m.stato                                as stato_ordine,
       m.sede_id                              as sede_richiedente,
       f.sede_collegata                       as sede_fornitrice,
       r.articolo_id,
       r.quantita                             as ordinata,
       coalesce(t.trasferita, 0)              as trasferita,
       coalesce(a.annullata, 0)               as annullata,
       r.quantita - coalesce(t.trasferita, 0) - coalesce(a.annullata, 0) as residuo
from movimenti_righe r
join movimenti m on m.id = r.movimento_id
join fornitori f on f.id = m.fornitore_id
left join (
  select x.ordine_riga_id, sum(x.quantita) as trasferita
  from movimenti_righe x
  join movimenti mx on mx.id = x.movimento_id
  where mx.tipo = 'trasferimento_a_filiale' and mx.stato in ('Definitivo', 'Evaso') and x.ordine_riga_id is not null
  group by x.ordine_riga_id
) t on t.ordine_riga_id = r.id
left join (
  select ordine_riga_id, sum(quantita) as annullata from inevasi_annullati group by ordine_riga_id
) a on a.ordine_riga_id = r.id
where m.tipo = 'ordine_fornitore' and m.stato in ('Definitivo', 'Evaso') and f.sede_collegata is not null;
alter view inevasi set (security_invoker = on);
grant select on inevasi to authenticated;

-- Controllo: deve dare una riga con colonna_ok = true e tabella_ok = true
select
  exists (select 1 from information_schema.columns where table_name = 'movimenti_righe' and column_name = 'ordine_riga_id') as colonna_ok,
  exists (select 1 from information_schema.tables where table_name = 'inevasi_annullati') as tabella_ok;
