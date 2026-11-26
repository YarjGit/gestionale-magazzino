-- ============================================================================================================
-- 35 – Velocità del database e controlli in più (si può eseguire SUBITO: non cambia niente per il prototipo)
-- Da incollare nel SQL Editor di Supabase dopo il 34. Si può rieseguire.
-- ============================================================================================================

-- ---------- 1. Indici: le ricerche restano veloci quando movimenti e righe diventano decine di migliaia ----------
create index if not exists movimenti_arrivo      on movimenti (sede_altra_id, tipo, data_movimento desc);  -- trasferimenti in arrivo
create index if not exists movimenti_fornitore   on movimenti (fornitore_id);                              -- ordini e carichi di un fornitore
create index if not exists movimenti_cliente     on movimenti (cliente_id);
create index if not exists movimenti_tipo_stato  on movimenti (tipo, stato);                               -- ordini aperti, inventari in corso
create index if not exists articoli_fornitore    on articoli (fornitore_id);
create index if not exists articoli_fornitore2   on articoli (fornitore2_id);
create index if not exists articoli_codice_lower on articoli (lower(codice));                              -- codice esatto (pistola)
create index if not exists registro_riferimento  on registro_attivita (tabella, riferimento);              -- storico di una scheda
create index if not exists annullati_riga        on inevasi_annullati (ordine_riga_id);

-- ricerca "contiene" su codice e descrizione (elenco articoli, anagrafiche): indice a trigrammi
create extension if not exists pg_trgm;
create index if not exists articoli_codice_trgm on articoli using gin (codice gin_trgm_ops);
create index if not exists articoli_descr_trgm  on articoli using gin (descrizione gin_trgm_ops);

-- ---------- 2. Permessi più veloci ----------
-- "e_autorizzato()" scritto così, (select e_autorizzato()), si calcola una volta per richiesta invece che per ogni riga
-- (consiglio di Supabase per le tabelle grandi). Le regole restano identiche.
do $$
declare t text;
begin
  foreach t in array array['sedi', 'aliquote_iva', 'fornitori', 'clienti', 'articoli', 'tipi_movimento', 'movimenti', 'movimenti_righe',
                           'inevasi_annullati', 'fornitori_sedi'] loop
    execute format('drop policy if exists solo_autorizzati on %I', t);
    execute format('create policy solo_autorizzati on %I for all to authenticated using ((select e_autorizzato())) with check ((select e_autorizzato()))', t);
  end loop;
end $$;

-- ---------- 3. Un trasferimento non può andare verso la stessa sede che lo manda ----------
-- "not valid": non ricontrolla i movimenti vecchi, vale da adesso in poi.
alter table movimenti drop constraint if exists trasferimento_non_a_se_stessa;
alter table movimenti add constraint trasferimento_non_a_se_stessa
  check (tipo <> 'trasferimento_a_filiale' or sede_altra_id is distinct from sede_id) not valid;

-- ---------- 4. Spazio occupato (piano gratuito: 500 MB) ----------
-- Solo per l'amministratore: quanto pesa ogni tabella, per tenere d'occhio il limite del piano gratuito.
create or replace function spazio_database()
returns table (tabella text, righe bigint, mb numeric)
language sql stable security definer set search_path = public as $$
  select c.relname::text, c.reltuples::bigint, round(pg_total_relation_size(c.oid) / 1048576.0, 2)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and e_amministratore()
  order by pg_total_relation_size(c.oid) desc;
$$;
grant execute on function spazio_database() to authenticated;

-- Controllo: deve dare una riga con indici_ok = 11 e vincolo_ok = true
select
  (select count(*) from pg_indexes where schemaname = 'public' and indexname in ('movimenti_arrivo', 'movimenti_fornitore', 'movimenti_cliente',
     'movimenti_tipo_stato', 'articoli_fornitore', 'articoli_fornitore2', 'articoli_codice_lower', 'registro_riferimento', 'annullati_riga',
     'articoli_codice_trgm', 'articoli_descr_trgm')) as indici_ok,
  exists (select 1 from pg_constraint where conname = 'trasferimento_non_a_se_stessa') as vincolo_ok;
