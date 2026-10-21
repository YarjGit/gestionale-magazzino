-- Controllo degli utenti autorizzati senza badare a maiuscole/minuscole dell'email.
-- (Già incluso in 01-tabelle.sql per i progetti nuovi; questo serve per il progetto già creato.)
create or replace function e_autorizzato() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from utenti_autorizzati where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- Controllo: Calandrini c'è? (deve dare 1)
select count(*) as fornitori_calandrini from fornitori where ragione_sociale ilike '%calandrini%';
