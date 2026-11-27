-- ============================================================================================================
-- 36 – Permessi per sede: tutti VEDONO i dati di tutte le sedi, ma MODIFICANO solo quelli della propria sede
--      (regola dell'utente: "modificare i dati solamente della propria sede, almeno per adesso"). Gli amministratori tutto.
--
-- ⚠ PRIMA DI ESEGUIRLO: in Utenti Sito (prototipo o nuova versione) spunta per OGNI persona la sua sede.
--   Chi non ha nessuna sede spuntata (e non è amministratore) da quel momento non potrà più salvare movimenti.
--   La query in fondo elenca chi non ha ancora una sede: deve dare 0 righe prima di eseguire il resto.
--
-- Vale sia per il prototipo sia per la nuova versione, perché il controllo è sulle tabelle (trigger), non nella pagina.
-- Eccezioni necessarie al lavoro tra sedi:
--   • chi RICEVE un trasferimento può confermare l'arrivo (solo "ricevuto il / da"), anche se il movimento è dell'altra sede;
--   • la sede che PREPARA l'ordine di una filiale (es. Magazzino Centrale) può metterlo "Evaso" (solo lo stato).
-- Per tornare come prima: eseguire la parte "PER TORNARE INDIETRO" in fondo.
-- ============================================================================================================

-- Chi deve controllare prima di eseguire: utenti non bloccati, non amministratori, senza sede (deve dare 0 righe)
-- select email, nome from utenti_autorizzati where not coalesce(bloccato, false) and not ('amministratore' = any(coalesce(ruoli, '{}'))) and coalesce(array_length(sedi, 1), 0) = 0;

-- ---------- Regola: può scrivere nella sede? ----------
create or replace function puo_scrivere_sede(p_sede text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from utenti_autorizzati u
    where lower(u.email) = lower(auth.jwt() ->> 'email') and not coalesce(u.bloccato, false)
      and ('amministratore' = any(coalesce(u.ruoli, '{}')) or p_sede = any(coalesce(u.sedi, '{}'))));
$$;

-- solo le richieste fatte da una persona dalla pagina vengono controllate (non il SQL Editor né le funzioni di servizio)
create or replace function _da_controllare() returns boolean
language sql stable set search_path = public as $$
  -- le funzioni sicure del database (es. ricevi_con_mancanti, 39) controllano i permessi da sole
  select coalesce(current_setting('gestionale.funzione_sicura', true), '') <> '1'
     and coalesce(auth.jwt() ->> 'role', '') = 'authenticated';
$$;

-- colonne cambiate tra due versioni della stessa riga (senza le date di modifica)
create or replace function _colonne_cambiate(p_vecchio jsonb, p_nuovo jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(k), '{}') from jsonb_object_keys(p_nuovo) k
  where k not in ('modificato_il', 'modificato_da') and p_nuovo -> k is distinct from p_vecchio -> k;
$$;

-- ---------- Movimenti ----------
create or replace function controlla_sede_movimenti() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cambiate text[];
begin
  if not _da_controllare() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if puo_scrivere_sede(new.sede_id) then return new; end if;
    raise exception 'SEDE_NON_TUA|Utente non autorizzato a scrivere in questa sede (%)', new.sede_id;
  elsif tg_op = 'DELETE' then
    if puo_scrivere_sede(old.sede_id) then return old; end if;
    raise exception 'SEDE_NON_TUA|Utente non autorizzato a scrivere in questa sede (%)', old.sede_id;
  end if;
  -- UPDATE
  if puo_scrivere_sede(old.sede_id) and puo_scrivere_sede(new.sede_id) then return new; end if;
  v_cambiate := _colonne_cambiate(to_jsonb(old), to_jsonb(new));
  -- chi riceve conferma l'arrivo del trasferimento
  if old.tipo = 'trasferimento_a_filiale' and puo_scrivere_sede(old.sede_altra_id) and v_cambiate <@ array['ricevuto_il', 'ricevuto_da'] then return new; end if;
  -- la sede che prepara l'ordine di una filiale lo mette "Evaso"
  if old.tipo = 'ordine_fornitore' and new.stato = 'Evaso' and v_cambiate <@ array['stato']
     and exists (select 1 from fornitori f where f.id = old.fornitore_id and puo_scrivere_sede(f.sede_collegata)) then return new; end if;
  raise exception 'SEDE_NON_TUA|Utente non autorizzato a scrivere in questa sede (%)', old.sede_id;
end $$;
drop trigger if exists controlla_sede on movimenti;
create trigger controlla_sede before insert or update or delete on movimenti for each row execute function controlla_sede_movimenti();

-- ---------- Righe dei movimenti: come il movimento a cui appartengono ----------
create or replace function controlla_sede_righe() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sede text;
begin
  if not _da_controllare() then return coalesce(new, old); end if;
  select sede_id into v_sede from movimenti where id = coalesce(new.movimento_id, old.movimento_id);
  if v_sede is null or puo_scrivere_sede(v_sede) then return coalesce(new, old); end if;
  raise exception 'SEDE_NON_TUA|Utente non autorizzato a scrivere in questa sede (%)', v_sede;
end $$;
drop trigger if exists controlla_sede on movimenti_righe;
create trigger controlla_sede before insert or update or delete on movimenti_righe for each row execute function controlla_sede_righe();

-- ---------- Inevasi cancellati: solo la sede che deve mandare la merce ----------
create or replace function controlla_sede_annullati() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sede text;
begin
  if not _da_controllare() then return coalesce(new, old); end if;
  select sede_fornitrice into v_sede from inevasi where ordine_riga_id = coalesce(new.ordine_riga_id, old.ordine_riga_id);
  if v_sede is null or puo_scrivere_sede(v_sede) then return coalesce(new, old); end if;
  raise exception 'SEDE_NON_TUA|Solo la sede che deve mandare la merce può cancellare l''inevaso';
end $$;
drop trigger if exists controlla_sede on inevasi_annullati;
create trigger controlla_sede before insert or update or delete on inevasi_annullati for each row execute function controlla_sede_annullati();

-- Controllo: deve dare 3
select count(*) as trigger_ok from pg_trigger where tgname = 'controlla_sede' and not tgisinternal;

-- ---------- PER TORNARE INDIETRO (tutti possono di nuovo scrivere in tutte le sedi) ----------
-- drop trigger if exists controlla_sede on movimenti;
-- drop trigger if exists controlla_sede on movimenti_righe;
-- drop trigger if exists controlla_sede on inevasi_annullati;
-- create or replace function puo_scrivere_sede(p_sede text) returns boolean language sql stable security definer set search_path = public as $f$ select e_autorizzato(); $f$;
