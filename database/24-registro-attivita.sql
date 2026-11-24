-- Registro delle attività degli utenti (pagina Setup → Attività Utenti, 24/11/2026).
-- Chi: la mail con cui si è entrati, presa dal database stesso (non si può cambiare dalla pagina).
-- Cosa: ogni nuovo movimento, modifica, cambio di stato, ricezione, cancellazione, e le modifiche ad articoli, fornitori,
-- clienti, fornitori delle sedi e utenti autorizzati (le scrive il database, da solo); in più accessi, uscite, cambi di sede,
-- stampe ed Excel (li scrive la pagina).
-- Il registro si può solo leggere e aggiungere: nessuno può modificarlo o cancellarlo dal gestionale. Si può rieseguire.

create table if not exists registro_attivita (
  id           bigint generated always as identity primary key,
  quando       timestamptz not null default now(),
  email        text default (auth.jwt() ->> 'email'),
  sede         text,                 -- sede di lavoro (pagina) o sede del movimento
  attivita     text not null,        -- es. "Accesso", "Nuovo movimento", "Modifica articolo"
  dettagli     text,
  tabella      text,                 -- movimenti, articoli, fornitori… (per aprire la scheda)
  riferimento  text,                 -- id del movimento, codice dell'articolo o del fornitore
  dispositivo  text                  -- browser e sistema, per gli eventi scritti dalla pagina
);
create index if not exists registro_quando on registro_attivita (quando desc);
create index if not exists registro_email on registro_attivita (email);

alter table registro_attivita enable row level security;
drop policy if exists leggono_autorizzati on registro_attivita;
drop policy if exists scrivono_autorizzati on registro_attivita;
create policy leggono_autorizzati on registro_attivita for select to authenticated using (e_autorizzato());
-- dalla pagina si aggiunge solo a proprio nome
create policy scrivono_autorizzati on registro_attivita for insert to authenticated
  with check (e_autorizzato() and lower(email) = lower(auth.jwt() ->> 'email'));
-- nessuna regola per update/delete: il registro non si modifica

-- Funzione che annota da sola le modifiche alle tabelle
create or replace function registra_modifica() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  vecchio jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  nuovo   jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  riga    jsonb := coalesce(nuovo, vecchio);
  campi   text;
  cosa    text;
  dett    text;
  rif     text;
  sede    text;
begin
  if tg_op = 'UPDATE' then
    select string_agg(k, ', ' order by k) into campi
    from jsonb_object_keys(nuovo) k
    where k not in ('modificato_il', 'creato_il') and nuovo -> k is distinct from vecchio -> k;
    if campi is null then return new; end if;
  end if;

  if tg_table_name = 'movimenti' then
    rif  := riga ->> 'id';
    sede := riga ->> 'sede_id';
    dett := (riga ->> 'tipo') || ' #' || (riga ->> 'id') || coalesce(' · n. ' || (riga ->> 'numero_documento'), '');
    if tg_op = 'INSERT' then cosa := 'Nuovo movimento'; dett := dett || ' · ' || coalesce(riga ->> 'stato', '');
    elsif tg_op = 'DELETE' then cosa := 'Movimento eliminato';
    elsif vecchio ->> 'ricevuto_il' is null and nuovo ->> 'ricevuto_il' is not null then cosa := 'Conferma ricevuto';
    elsif vecchio ->> 'stato' is distinct from nuovo ->> 'stato' then
      cosa := 'Cambio stato'; dett := dett || ': ' || coalesce(vecchio ->> 'stato', '') || ' → ' || coalesce(nuovo ->> 'stato', '');
    else cosa := 'Modifica movimento'; dett := dett || ' (' || campi || ')';
    end if;
  elsif tg_table_name = 'articoli' then
    rif := riga ->> 'codice';
    dett := (riga ->> 'codice') || ' · ' || coalesce(riga ->> 'descrizione', '');
    cosa := case tg_op when 'INSERT' then 'Nuovo articolo' when 'DELETE' then 'Articolo eliminato' else 'Modifica articolo' end;
    if tg_op = 'UPDATE' then dett := dett || ' (' || campi || ')'; end if;
  elsif tg_table_name = 'fornitori' then
    rif := riga ->> 'codice';
    dett := (riga ->> 'codice') || ' · ' || coalesce(riga ->> 'ragione_sociale', '');
    cosa := case tg_op when 'INSERT' then 'Nuovo fornitore' when 'DELETE' then 'Fornitore eliminato' else 'Modifica fornitore' end;
    if tg_op = 'UPDATE' then dett := dett || ' (' || campi || ')'; end if;
  elsif tg_table_name = 'clienti' then
    rif := riga ->> 'codice';
    dett := (riga ->> 'codice') || ' · ' || coalesce(riga ->> 'nome', '');
    cosa := case tg_op when 'INSERT' then 'Nuovo cliente' when 'DELETE' then 'Cliente eliminato' else 'Modifica cliente' end;
    if tg_op = 'UPDATE' then dett := dett || ' (' || campi || ')'; end if;
  elsif tg_table_name = 'fornitori_sedi' then
    sede := riga ->> 'sede_id';
    select f.codice, f.codice || ' · ' || f.ragione_sociale into rif, dett from fornitori f where f.id = (riga ->> 'fornitore_id')::uuid;
    cosa := case tg_op when 'INSERT' then 'Fornitore aggiunto alla sede' else 'Fornitore tolto dalla sede' end;
  elsif tg_table_name = 'utenti_autorizzati' then
    rif := riga ->> 'email';
    dett := (riga ->> 'email') || coalesce(' · ' || (riga ->> 'ruolo'), '');
    cosa := case tg_op when 'INSERT' then 'Utente autorizzato' when 'DELETE' then 'Utente tolto' else 'Modifica utente' end;
    if tg_op = 'UPDATE' then dett := dett || ' (' || campi || ')'; end if;
  else
    return coalesce(new, old);
  end if;

  insert into registro_attivita (email, sede, attivita, dettagli, tabella, riferimento)
  values (coalesce(auth.jwt() ->> 'email', 'SQL Editor (Supabase)'), sede, cosa, left(dett, 500), tg_table_name, rif);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['movimenti', 'articoli', 'fornitori', 'clienti', 'fornitori_sedi', 'utenti_autorizzati'] loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('drop trigger if exists registra on %I', t);
      execute format('create trigger registra after insert or update or delete on %I for each row execute function registra_modifica()', t);
    end if;
  end loop;
end $$;

-- Controllo: deve dare il numero di tabelle controllate (6, o 5 se fornitori_sedi non c'è ancora)
select count(*) as tabelle_controllate from information_schema.triggers where trigger_name = 'registra' and event_manipulation = 'INSERT';
