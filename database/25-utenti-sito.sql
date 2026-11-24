-- Utenti Sito (Setup → Utenti Sito, 24/11/2026): chi può entrare nel gestionale, con i suoi ruoli, come nel gestionale attuale.
-- Ruoli: amministratore, responsabile magazzino, operatore, traduttore, diagnostica/sistema (uno o più per persona).
-- Un utente "bloccato" non vede più nessun dato (resta nell'elenco e nel registro delle attività).
-- Solo gli amministratori possono aggiungere, modificare o bloccare utenti. Si può rieseguire.

alter table utenti_autorizzati add column if not exists ruoli     text[] not null default '{operatore}';
alter table utenti_autorizzati add column if not exists bloccato  boolean not null default false;
alter table utenti_autorizzati add column if not exists creato_il timestamptz not null default now();

-- I ruoli ammessi
alter table utenti_autorizzati drop constraint if exists ruoli_ammessi;
alter table utenti_autorizzati add constraint ruoli_ammessi
  check (ruoli <@ array['amministratore', 'responsabile_magazzino', 'operatore', 'traduttore', 'diagnostica']::text[] and cardinality(ruoli) > 0);

-- La vecchia colonna "ruolo" (uno solo) passa nei "ruoli"; resta per compatibilità
update utenti_autorizzati set ruoli = array[ruolo] where ruoli = '{operatore}' and ruolo = 'amministratore';
-- Se nessuno è amministratore, lo diventano tutti quelli già autorizzati (oggi sono le persone che hanno preparato il gestionale)
update utenti_autorizzati set ruoli = array_append(ruoli, 'amministratore')
where not exists (select 1 from utenti_autorizzati where 'amministratore' = any(ruoli)) and not ('amministratore' = any(ruoli));

-- Chi è bloccato non entra più
create or replace function e_autorizzato() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from utenti_autorizzati where lower(email) = lower(auth.jwt() ->> 'email') and not bloccato);
$$;
create or replace function e_amministratore() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from utenti_autorizzati
                 where lower(email) = lower(auth.jwt() ->> 'email') and not bloccato and 'amministratore' = any(ruoli));
$$;
grant execute on function e_amministratore() to authenticated;

-- Tutti gli autorizzati vedono l'elenco; solo gli amministratori lo cambiano
drop policy if exists solo_autorizzati on utenti_autorizzati;
drop policy if exists leggono_autorizzati on utenti_autorizzati;
drop policy if exists cambiano_amministratori on utenti_autorizzati;
create policy leggono_autorizzati on utenti_autorizzati for select to authenticated using (e_autorizzato());
create policy cambiano_amministratori on utenti_autorizzati for all to authenticated using (e_amministratore()) with check (e_amministratore());

-- Controllo: gli utenti con i loro ruoli (almeno uno deve essere amministratore)
select email, nome, ruoli, bloccato from utenti_autorizzati order by email;
