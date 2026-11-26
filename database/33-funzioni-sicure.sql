-- Funzioni sicure per tutte le scritture del nuovo frontend Angular (26/11/2026).
-- Regola (frontend-angular/CLAUDE.md): nessuna scrittura diretta dalle pagine; ogni operazione è una funzione PostgreSQL
-- in una sola transazione, con i suoi controlli. Questo script SI AGGIUNGE e basta: il prototipo in JavaScript puro
-- continua a funzionare come prima (le scritture dirette si chiudono più avanti, con 34-permessi-per-sede.sql).
-- Si può rieseguire.

-- ============================================================================================================
-- Permessi
-- ============================================================================================================

-- Chi può SCRIVERE i dati di una sede. Per ora come oggi: ogni utente autorizzato (34-permessi-per-sede.sql la restringe:
-- ognuno scrive solo nelle sue sedi, amministratori e responsabili magazzino ovunque).
create or replace function puo_scrivere_sede(p_sede text) returns boolean
language sql stable security definer set search_path = public as $$
  select e_autorizzato();
$$;

create or replace function ha_ruolo(p_ruolo text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from utenti_autorizzati
                 where lower(email) = lower(auth.jwt() ->> 'email') and not bloccato and p_ruolo = any(ruoli));
$$;

-- Controllo di una giacenza dopo una modifica: se un articolo è andato sotto zero nella sede, errore (si annulla tutto)
create or replace function controlla_giacenza(p_sede text, p_articoli uuid[]) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_errore text;
begin
  select string_agg(format('%s (in giacenza %s)', a.codice, g.quantita), '; ') into v_errore
  from giacenze g join articoli a on a.id = g.articolo_id
  where g.sede_id = p_sede and g.articolo_id = any(p_articoli) and g.quantita < 0;
  if v_errore is not null then raise exception 'Giacenza insufficiente: %', v_errore; end if;
end $$;

-- Lucchetti per sede e articolo, sempre nello stesso ordine (come salva_movimento): due operazioni sugli stessi articoli si mettono in fila
create or replace function blocca_articoli(p_sede text, p_articoli uuid[]) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_chiave text;
begin
  for v_chiave in select distinct 'art:' || p_sede || ':' || a::text from unnest(p_articoli) a order by 1 loop
    perform pg_advisory_xact_lock(hashtext(v_chiave));
  end loop;
end $$;

-- ============================================================================================================
-- Movimenti
-- ============================================================================================================

-- Salva un movimento e, nella STESSA transazione, mette "Evaso" gli ordini indicati
-- (trasferimento che prepara l'ordine di una filiale; carico che completa ordini a fornitore).
create or replace function salva_movimento_ed_evadi(p_id bigint, p_mov jsonb, p_righe jsonb, p_evadi bigint[])
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not puo_scrivere_sede(coalesce(p_mov ->> 'sede_id', (select sede_id from movimenti where id = p_id))) then
    raise exception 'Utente non autorizzato a scrivere in questa sede';
  end if;
  v_id := salva_movimento(p_id, p_mov, p_righe);
  if coalesce(p_mov ->> 'stato', '') in ('Definitivo', 'Evaso') and coalesce(array_length(p_evadi, 1), 0) > 0 then
    update movimenti set stato = 'Evaso', modificato_il = now(), modificato_da = auth.jwt() ->> 'email'
    where id = any(p_evadi) and stato = 'Definitivo' and tipo in ('ordine_fornitore', 'ordine_cliente');
  end if;
  return v_id;
end $$;

-- La sede che riceve conferma l'arrivo di un trasferimento: da adesso la merce è nella sua giacenza
create or replace function conferma_ricezione(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare m movimenti;
begin
  select * into m from movimenti where id = p_id for update;
  if not found or m.tipo <> 'trasferimento_a_filiale' then raise exception 'Trasferimento % non trovato', p_id; end if;
  if not puo_scrivere_sede(m.sede_altra_id) then raise exception 'Solo la sede che riceve può confermare l''arrivo'; end if;
  if m.stato not in ('Definitivo', 'Evaso') then raise exception 'Il trasferimento non è ancora stato spedito (è %)', m.stato; end if;
  if m.ricevuto_il is not null then raise exception 'Trasferimento già ricevuto il %', to_char(m.ricevuto_il at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI'); end if;
  update movimenti set ricevuto_il = now(), ricevuto_da = auth.jwt() ->> 'email', modificato_il = now() where id = p_id;
end $$;

-- Annulla un movimento (la merce torna come prima). Un trasferimento già ricevuto non si annulla.
-- Se annullando un carico la giacenza andrebbe sotto zero (merce già venduta), errore e non si annulla niente.
create or replace function annulla_movimento(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare m movimenti; v_articoli uuid[];
begin
  select * into m from movimenti where id = p_id for update;
  if not found then raise exception 'Movimento % non trovato', p_id; end if;
  if not puo_scrivere_sede(m.sede_id) then raise exception 'Utente non autorizzato a scrivere in questa sede'; end if;
  if m.stato = 'Annullato' then return; end if;
  if m.tipo = 'trasferimento_a_filiale' and m.ricevuto_il is not null then
    raise exception 'Il trasferimento è già stato ricevuto: non si può più annullare';
  end if;
  select array_agg(distinct articolo_id) into v_articoli from movimenti_righe where movimento_id = p_id;
  perform blocca_articoli(m.sede_id, coalesce(v_articoli, '{}'));
  update movimenti set stato = 'Annullato', modificato_il = now(), modificato_da = auth.jwt() ->> 'email' where id = p_id;
  perform controlla_giacenza(m.sede_id, coalesce(v_articoli, '{}'));
end $$;

-- Cancella (in tutto o in parte) un inevaso: non più di quanto resta da mandare; resta registrato chi, quando e perché
create or replace function annulla_inevaso(p_riga bigint, p_quantita numeric, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_residuo numeric; v_sede text;
begin
  perform pg_advisory_xact_lock(hashtext('ordriga:' || p_riga));
  select residuo, sede_fornitrice into v_residuo, v_sede from inevasi where ordine_riga_id = p_riga;
  if not found then raise exception 'Inevaso non trovato'; end if;
  if not puo_scrivere_sede(v_sede) then raise exception 'Solo la sede che deve mandare la merce può cancellare l''inevaso'; end if;
  if p_quantita is null or p_quantita <= 0 then raise exception 'Quantità da cancellare non valida'; end if;
  if p_quantita > v_residuo then raise exception 'Si possono cancellare al massimo % pezzi', v_residuo; end if;
  insert into inevasi_annullati (ordine_riga_id, quantita, motivo, annullato_da)
  values (p_riga, p_quantita, nullif(trim(p_motivo), ''), auth.jwt() ->> 'email');
end $$;

-- Ordine da cliente già scalato: si cambiano solo i dati del documento (bolla, colli, corriere…), mai le righe
create or replace function aggiorna_documento_movimento(p_id bigint, p_dati jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare m movimenti; v_cols text;
begin
  select * into m from movimenti where id = p_id for update;
  if not found then raise exception 'Movimento % non trovato', p_id; end if;
  if not puo_scrivere_sede(m.sede_id) then raise exception 'Utente non autorizzato a scrivere in questa sede'; end if;
  select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(p_dati) k
  where k in ('numero_documento', 'data_documento', 'data_bolla', 'causale', 'annotazioni', 'porto', 'spedizioniere',
              'tracking', 'colli', 'contenuto', 'peso', 'condizione_pagamento');
  if v_cols is null then return; end if;
  execute format('update movimenti set (%1$s, modificato_il, modificato_da) = (select %1$s, now(), $3 from jsonb_populate_record(null::movimenti, $1)) where id = $2', v_cols)
    using p_dati, p_id, auth.jwt() ->> 'email';
end $$;

-- ============================================================================================================
-- Inventario: la conferma calcola le differenze NEL DATABASE, con la giacenza di quel momento
-- ============================================================================================================
-- Il movimento "riallineamento" provvisorio ha le righe con quantita_contata (e azione 'elimina' per i non sparati da togliere).
-- Alla conferma, per ogni articolo: una riga toglie la giacenza di adesso e una mette i pezzi contati (anno in corso);
-- gli articoli "elimina" vanno a zero e vengono disattivati se nelle altre sedi non ce n'è.
-- Restituisce { "contati": n, "eliminati": n, "non_disattivati": [codici presenti in altre sedi] }.
create or replace function conferma_inventario(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m movimenti;
  v_articoli uuid[];
  v_righe jsonb;
  v_elimina uuid[];
  v_tenuti text[];
begin
  if not (ha_ruolo('amministratore') or ha_ruolo('responsabile_magazzino')) then
    raise exception 'Solo l''amministratore o il responsabile magazzino possono confermare l''inventario';
  end if;
  select * into m from movimenti where id = p_id for update;
  if not found or m.tipo <> 'riallineamento' then raise exception 'Inventario % non trovato', p_id; end if;
  if m.stato <> 'Provvisorio' then raise exception 'L''inventario non è in corso (è %)', m.stato; end if;
  if not puo_scrivere_sede(m.sede_id) then raise exception 'Utente non autorizzato a scrivere in questa sede'; end if;

  select array_agg(distinct articolo_id) into v_articoli from movimenti_righe where movimento_id = p_id;
  perform blocca_articoli(m.sede_id, coalesce(v_articoli, '{}'));

  -- righe definitive calcolate con la giacenza vera di adesso (dopo i lucchetti)
  with conteggi as (
    select r.articolo_id, max(r.prezzo) as prezzo, bool_or(r.azione = 'elimina') as elimina,
           coalesce(sum(r.quantita_contata), 0) as contati
    from movimenti_righe r where r.movimento_id = p_id group by r.articolo_id
  ), con_giacenza as (
    select c.*, coalesce((select g.quantita from giacenze g where g.sede_id = m.sede_id and g.articolo_id = c.articolo_id), 0) as giac
    from conteggi c
  )
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_righe from (
    select jsonb_build_object('articolo_id', articolo_id, 'quantita', -giac, 'quantita_contata', case when elimina then 0 else contati end,
             'azione', case when elimina then 'elimina' end, 'prezzo', prezzo, 'etichette', 0) as x
    from con_giacenza where giac <> 0 or contati = 0 or elimina
    union all
    select jsonb_build_object('articolo_id', articolo_id, 'quantita', contati, 'quantita_contata', case when giac = 0 then contati end,
             'prezzo', prezzo, 'etichette', 0)
    from con_giacenza where contati > 0 and not elimina
  ) t;

  delete from movimenti_righe where movimento_id = p_id;
  insert into movimenti_righe (movimento_id, articolo_id, quantita, quantita_contata, azione, prezzo, etichette)
  select p_id, (r ->> 'articolo_id')::uuid, (r ->> 'quantita')::numeric, (r ->> 'quantita_contata')::numeric,
         r ->> 'azione', coalesce((r ->> 'prezzo')::numeric, 0), 0
  from jsonb_array_elements(v_righe) r;
  update movimenti set stato = 'Definitivo', data_movimento = current_date, anno_acquisto = extract(year from current_date)::int,
         modificato_il = now(), modificato_da = auth.jwt() ->> 'email'
  where id = p_id;
  perform controlla_giacenza(m.sede_id, coalesce(v_articoli, '{}'));

  -- articoli eliminati: disattivati solo se nessun'altra sede ne ha
  select array_agg(distinct articolo_id) into v_elimina from movimenti_righe where movimento_id = p_id and azione = 'elimina';
  select array_agg(a.codice order by a.codice) into v_tenuti
  from articoli a where a.id = any(coalesce(v_elimina, '{}'))
    and exists (select 1 from giacenze g where g.articolo_id = a.id and g.sede_id <> m.sede_id and g.quantita <> 0);
  update articoli set attivo = false, modificato_il = now()
  where id = any(coalesce(v_elimina, '{}'))
    and not exists (select 1 from giacenze g where g.articolo_id = articoli.id and g.sede_id <> m.sede_id and g.quantita <> 0);

  return jsonb_build_object('contati', (select count(distinct articolo_id) from movimenti_righe where movimento_id = p_id and azione is null),
                            'eliminati', coalesce(array_length(v_elimina, 1), 0), 'non_disattivati', coalesce(to_jsonb(v_tenuti), '[]'::jsonb));
end $$;

-- ============================================================================================================
-- Anagrafiche
-- ============================================================================================================

-- Barcode nuovo e unico della serie interna 200 (EAN-13 con cifra di controllo), come il prototipo
create or replace function nuovo_barcode() returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_n bigint; v_dodici text; v_somma int := 0; i int; v_codice text;
begin
  perform pg_advisory_xact_lock(hashtext('barcode:200'));
  select coalesce(max(substr(barcode, 4, 9)::bigint), 0) + 1 into v_n
  from articoli where barcode ~ '^200\d{10}$';
  loop
    v_dodici := '200' || lpad(v_n::text, 9, '0');
    v_somma := 0;
    for i in 1..12 loop v_somma := v_somma + substr(v_dodici, i, 1)::int * case when i % 2 = 0 then 3 else 1 end; end loop;
    v_codice := v_dodici || ((10 - v_somma % 10) % 10)::text;
    exit when not exists (select 1 from articoli where barcode = v_codice);
    v_n := v_n + 1;
  end loop;
  return v_codice;
end $$;

-- Scrive una riga di un'anagrafica (insert o update) con le sole colonne che esistono e sono permesse
create or replace function _scrivi_anagrafica(p_tabella text, p_id text, p_dati jsonb, p_escludi text[]) returns text
language plpgsql security definer set search_path = public as $$
declare v_cols text; v_id text;
begin
  select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(p_dati) k
  where k in (select column_name from information_schema.columns where table_schema = 'public' and table_name = p_tabella)
    and k <> all(p_escludi || array['id', 'creato_il', 'modificato_il']);
  if v_cols is null then raise exception 'Nessun dato da salvare'; end if;
  if p_id is null then
    execute format('insert into %1$I (%2$s) select %2$s from jsonb_populate_record(null::%1$I, $1) returning id::text', p_tabella, v_cols)
      into v_id using p_dati;
  else
    execute format('update %1$I set (%2$s) = (select %2$s from jsonb_populate_record(null::%1$I, $1)) where id::text = $2 returning id::text', p_tabella, v_cols)
      into v_id using p_dati, p_id;
    if v_id is null then raise exception 'Riga % non trovata', p_id; end if;
  end if;
  return v_id;
end $$;

-- Articolo nuovo o modificato. Barcode: se manca lo crea il database. Il prezzo in etichetta lo arrotonda il trigger (29).
-- p_versione = modificato_il letto dalla pagina: se nel frattempo è cambiato, CONFLITTO.
create or replace function salva_articolo(p_id uuid, p_dati jsonb, p_versione timestamptz default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id text; v_vecchio articoli;
begin
  if not e_autorizzato() then raise exception 'Utente non autorizzato'; end if;
  if p_id is not null then
    select * into v_vecchio from articoli where id = p_id for update;
    if not found then raise exception 'Articolo non trovato'; end if;
    if p_versione is not null and date_trunc('milliseconds', p_versione) <> date_trunc('milliseconds', v_vecchio.modificato_il) then
      raise exception 'CONFLITTO|un altro computer|%', to_char(v_vecchio.modificato_il at time zone 'Europe/Rome', 'DD/MM HH24:MI');
    end if;
  end if;
  if coalesce(trim(p_dati ->> 'codice'), '') = '' and p_id is null then raise exception 'Il codice è obbligatorio'; end if;
  if p_id is null and coalesce(p_dati ->> 'barcode', '') = '' then p_dati := p_dati || jsonb_build_object('barcode', nuovo_barcode()); end if;
  if p_id is not null then p_dati := p_dati - 'barcode' - 'codice'; end if;   -- codice e barcode non si cambiano
  v_id := _scrivi_anagrafica('articoli', p_id::text, p_dati, array['id_vecchio']);
  update articoli set modificato_il = now() where id = v_id::uuid;
  return v_id::uuid;
end $$;

-- Fornitore nuovo o modificato, con le sedi che lo usano (fornitori_sedi)
create or replace function salva_fornitore(p_id uuid, p_dati jsonb, p_sedi text[] default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not e_autorizzato() then raise exception 'Utente non autorizzato'; end if;
  if p_id is null and coalesce(p_dati ->> 'codice', '') = '' then
    perform pg_advisory_xact_lock(hashtext('codice:fornitori'));
    p_dati := p_dati || jsonb_build_object('codice', (select coalesce(max(codice::bigint), 0) + 1 from fornitori where codice ~ '^\d{1,9}$')::text);
  end if;
  v_id := _scrivi_anagrafica('fornitori', p_id::text, p_dati, array['id_vecchio'])::uuid;
  update fornitori set modificato_il = now() where id = v_id;
  if p_sedi is not null then
    delete from fornitori_sedi where fornitore_id = v_id and sede_id <> all(p_sedi);
    insert into fornitori_sedi (fornitore_id, sede_id) select v_id, s from unnest(p_sedi) s on conflict do nothing;
  end if;
  return v_id;
end $$;

-- Cliente nuovo o modificato (codice automatico se manca)
create or replace function salva_cliente(p_id uuid, p_dati jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not e_autorizzato() then raise exception 'Utente non autorizzato'; end if;
  if p_id is null and coalesce(p_dati ->> 'codice', '') = '' then
    perform pg_advisory_xact_lock(hashtext('codice:clienti'));
    p_dati := p_dati || jsonb_build_object('codice', 'C' || lpad(((select coalesce(max(substring(codice from '^C(\d+)$')::int), 0) from clienti) + 1)::text, 5, '0'));
  end if;
  return _scrivi_anagrafica('clienti', p_id::text, p_dati, array['id_vecchio'])::uuid;
end $$;

-- Utenti del sito: solo gli amministratori; nessuno può togliersi da solo il ruolo di amministratore o bloccarsi
create or replace function salva_utente(p_email text, p_dati jsonb, p_nuovo boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_io text := lower(auth.jwt() ->> 'email');
begin
  if not e_amministratore() then raise exception 'Solo gli amministratori possono gestire gli utenti'; end if;
  if v_email = v_io and (coalesce((p_dati ->> 'bloccato')::boolean, false)
     or (p_dati ? 'ruoli' and not (p_dati -> 'ruoli') ? 'amministratore')) then
    raise exception 'Non puoi bloccare te stesso o toglierti il ruolo di amministratore';
  end if;
  if p_nuovo then
    insert into utenti_autorizzati (email, nome, ruoli, bloccato, sedi)
    values (v_email, p_dati ->> 'nome', coalesce(array(select jsonb_array_elements_text(p_dati -> 'ruoli')), '{operatore}'),
            coalesce((p_dati ->> 'bloccato')::boolean, false), coalesce(array(select jsonb_array_elements_text(p_dati -> 'sedi')), '{}'));
  else
    update utenti_autorizzati set
      nome = coalesce(p_dati ->> 'nome', nome),
      ruoli = case when p_dati ? 'ruoli' then array(select jsonb_array_elements_text(p_dati -> 'ruoli')) else ruoli end,
      bloccato = coalesce((p_dati ->> 'bloccato')::boolean, bloccato),
      sedi = case when p_dati ? 'sedi' then array(select jsonb_array_elements_text(p_dati -> 'sedi')) else sedi end
    where lower(email) = v_email;
    if not found then raise exception 'Utente % non trovato', v_email; end if;
  end if;
end $$;

-- Evento nel registro attività scritto dalla pagina (accesso, uscita, cambio sede, stampe)
create or replace function registra_evento(p_attivita text, p_dettagli text, p_sede text, p_dispositivo text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not e_autorizzato() then return; end if;
  insert into registro_attivita (email, sede, attivita, dettagli, dispositivo)
  values (auth.jwt() ->> 'email', p_sede, left(p_attivita, 100), left(p_dettagli, 500), left(p_dispositivo, 200));
end $$;

-- ============================================================================================================
-- Letture pesanti fatte dal database (una pagina alla volta)
-- ============================================================================================================

-- Giacenze di una sede per l'elenco Giacenze: articolo + quantità, con ricerca e filtri, paginate
create or replace function giacenze_sede(p_sede text, p_cerca text default null, p_solo_presenti boolean default true,
                                         p_sotto_scorta boolean default false, p_da int default 0, p_quanti int default 50)
returns table (articolo_id uuid, codice text, descrizione text, barcode text, costo_netto numeric, prezzo_vendita_ivato numeric,
               scorta_minima int, quantita numeric, totale bigint)
language sql stable security invoker set search_path = public as $$
  with base as (
    select a.id, a.codice, a.descrizione, a.barcode, a.costo_netto, a.prezzo_vendita_ivato, a.scorta_minima,
           coalesce(g.quantita, 0)::numeric as quantita
    from articoli a left join giacenze g on g.articolo_id = a.id and g.sede_id = p_sede
    where a.attivo
      and (p_cerca is null or p_cerca = '' or a.codice ilike '%' || p_cerca || '%' or a.descrizione ilike '%' || p_cerca || '%' or a.barcode = p_cerca)
      and (not p_solo_presenti or coalesce(g.quantita, 0) <> 0)
      and (not p_sotto_scorta or (a.scorta_minima > 0 and coalesce(g.quantita, 0) < a.scorta_minima))
  )
  select id, codice, descrizione, barcode, costo_netto, prezzo_vendita_ivato, scorta_minima, quantita, count(*) over () as totale
  from base order by codice limit greatest(1, least(p_quanti, 200)) offset greatest(0, p_da);
$$;

-- Elenco Articoli (pagina articoli): filtri, ricerca a più parole (codice, descrizione, barcode), schede per giacenza,
-- ordinamento e paginazione nel database, con la giacenza della sede di lavoro. Righe con il totale per la paginazione.
create or replace function articoli_elenco(
  p_sede text, p_cerca text default null, p_fornitore uuid default null, p_cod_da text default null, p_cod_a text default null,
  p_anno int default null, p_prezzo_min numeric default null, p_prezzo_max numeric default null, p_iva numeric default null,
  p_scheda text default '', p_solo_giacenza boolean default false, p_ordina text default 'codice', p_crescente boolean default true,
  p_da int default 0, p_quanti int default 25)
returns table (id uuid, codice text, descrizione text, barcode text, costo_netto numeric, prezzo_vendita_ivato numeric, iva numeric,
               fornitore_id uuid, anno_listino int, quantita numeric, totale bigint)
language plpgsql stable security invoker set search_path = public as $$
declare v_parole text[] := array(select p from unnest(string_to_array(lower(coalesce(trim(p_cerca), '')), ' ')) p where p <> '');
begin
  return query
  with base as (
    select a.id, a.codice, a.descrizione, a.barcode, a.costo_netto, a.prezzo_vendita_ivato, coalesce(i.aliquota, 22) as iva,
           a.fornitore_id, a.anno_listino, g.quantita
    from articoli a
    left join aliquote_iva i on i.codice = a.aliquota_iva
    left join giacenze g on g.articolo_id = a.id and g.sede_id = p_sede
    where a.attivo
      and (cardinality(v_parole) = 0 or not exists (select 1 from unnest(v_parole) w
             where (lower(a.codice) || ' ' || lower(a.descrizione) || ' ' || coalesce(a.barcode, '')) not like '%' || w || '%'))
      and (p_fornitore is null or a.fornitore_id = p_fornitore)
      and (p_cod_da is null or p_cod_da = '' or lower(a.codice) >= lower(p_cod_da))
      and (p_cod_a is null or p_cod_a = '' or lower(a.codice) <= lower(p_cod_a) || chr(65535))
      and (p_anno is null or a.anno_listino = p_anno)
      and (p_prezzo_min is null or a.prezzo_vendita_ivato >= p_prezzo_min)
      and (p_prezzo_max is null or a.prezzo_vendita_ivato <= p_prezzo_max)
      and (p_iva is null or coalesce(i.aliquota, 22) = p_iva)
      and (not p_solo_giacenza or coalesce(g.quantita, 0) > 0)
      and (p_scheda = '' or (p_scheda = 'disp' and coalesce(g.quantita, 0) > 0) or (p_scheda = 'esauriti' and coalesce(g.quantita, 0) = 0)
           or (p_scheda = 'neg' and coalesce(g.quantita, 0) < 0))
  )
  select b.id, b.codice, b.descrizione, b.barcode, b.costo_netto, b.prezzo_vendita_ivato, b.iva, b.fornitore_id, b.anno_listino, b.quantita,
         count(*) over () as totale
  from base b
  order by
    case when p_ordina = 'codice' and p_crescente then b.codice end asc, case when p_ordina = 'codice' and not p_crescente then b.codice end desc,
    case when p_ordina = 'descrizione' and p_crescente then b.descrizione end asc, case when p_ordina = 'descrizione' and not p_crescente then b.descrizione end desc,
    case when p_ordina = 'giacenza' and p_crescente then coalesce(b.quantita, -999999) end asc, case when p_ordina = 'giacenza' and not p_crescente then coalesce(b.quantita, -999999) end desc,
    case when p_ordina = 'prezzo' and p_crescente then b.prezzo_vendita_ivato end asc, case when p_ordina = 'prezzo' and not p_crescente then b.prezzo_vendita_ivato end desc,
    case when p_ordina = 'barcode' and p_crescente then b.barcode end asc, case when p_ordina = 'barcode' and not p_crescente then b.barcode end desc,
    case when p_ordina = 'iva' and p_crescente then b.iva end asc, case when p_ordina = 'iva' and not p_crescente then b.iva end desc,
    b.codice
  limit greatest(1, least(p_quanti, 500)) offset greatest(0, p_da);
end $$;

-- Conteggi delle schede dell'elenco Articoli (Tutti, Disponibili, Esauriti, Negativi) nella sede
create or replace function articoli_conteggi(p_sede text)
returns table (tutti bigint, disponibili bigint, esauriti bigint, negativi bigint)
language sql stable security invoker set search_path = public as $$
  select count(*), count(*) filter (where coalesce(g.quantita, 0) > 0), count(*) filter (where coalesce(g.quantita, 0) = 0),
         count(*) filter (where coalesce(g.quantita, 0) < 0)
  from articoli a left join giacenze g on g.articolo_id = a.id and g.sede_id = p_sede
  where a.attivo;
$$;

grant execute on function articoli_elenco(text, text, uuid, text, text, int, numeric, numeric, numeric, text, boolean, text, boolean, int, int),
  articoli_conteggi(text) to authenticated;

-- ============================================================================================================
-- Scheda articolo: lotti per anno, movimenti, previsto per sede (calcolati nel database, come faceva la pagina del prototipo)
-- ============================================================================================================
-- Movimenti di un articolo in una sede in ordine di data, con giacenza prima/dopo e da quali lotti (anni di acquisto) escono i pezzi.
-- Entrate nel lotto del loro anno (carico: anno della data; aumento/inventario: anno di acquisto; trasferimento ricevuto: anno della
-- ricezione); uscite dal lotto più vecchio. Ordini a fornitore e da cliente definitivi compaiono con quantità 0 (ordinati / prenotati).
create or replace function _articolo_fifo(p_articolo uuid, p_sede text)
returns table (n int, data date, movimento_id bigint, tipo text, nome text, stato text, q numeric, prima numeric, dopo numeric,
               lotti jsonb, ordinati numeric, prenotati numeric, a_sede boolean)
language plpgsql stable security invoker set search_path = public as $$
declare
  e record; v_anni int[] := '{}'; v_rem numeric[] := '{}'; v_g numeric := 0; v_n int := 0;
  v_resta numeric; v_x numeric; i int; v_lotti jsonb; v_pos int; v_anno int;
begin
  for e in
    select ev.* from (
      select m.data_movimento as d, m.id as mid, m.tipo as tp, t.nome as nm, m.stato as st, r.quantita * t.segno as qq,
             coalesce(m.anno_acquisto, extract(year from m.data_movimento)::int) as lotto,
             0::numeric as ord, 0::numeric as pren, false as asede
      from movimenti_righe r join movimenti m on m.id = r.movimento_id join tipi_movimento t on t.codice = m.tipo
      where r.articolo_id = p_articolo and m.sede_id = p_sede and m.stato in ('Definitivo', 'Evaso') and t.segno <> 0
      union all
      select m.ricevuto_il::date, m.id, 'trasferimento_ricevuto', 'Trasferimento da Filiale', m.stato, r.quantita,
             extract(year from m.ricevuto_il)::int, 0, 0, false
      from movimenti_righe r join movimenti m on m.id = r.movimento_id
      where r.articolo_id = p_articolo and m.tipo = 'trasferimento_a_filiale' and m.sede_altra_id = p_sede
        and m.stato in ('Definitivo', 'Evaso') and m.ricevuto_il is not null
      union all
      select m.data_movimento, m.id, m.tipo, t.nome, m.stato, 0, null,
             case when m.tipo = 'ordine_fornitore' then r.quantita else 0 end, case when m.tipo = 'ordine_cliente' then r.quantita else 0 end,
             coalesce((select f.sede_collegata is not null from fornitori f where f.id = m.fornitore_id), false)
      from movimenti_righe r join movimenti m on m.id = r.movimento_id join tipi_movimento t on t.codice = m.tipo
      where r.articolo_id = p_articolo and m.sede_id = p_sede and m.stato = 'Definitivo' and m.tipo in ('ordine_fornitore', 'ordine_cliente')
    ) ev order by ev.d, ev.mid
  loop
    v_n := v_n + 1; v_lotti := '{}'::jsonb;
    if e.qq > 0 then
      v_pos := array_position(v_anni, e.lotto);
      if v_pos is null then
        v_anni := v_anni || e.lotto; v_rem := v_rem || e.qq;
        select array_agg(a order by a), array_agg(rr order by a) into v_anni, v_rem from unnest(v_anni, v_rem) x(a, rr);
      else
        v_rem[v_pos] := v_rem[v_pos] + e.qq;
      end if;
      v_lotti := jsonb_build_object(e.lotto::text, e.qq);
    elsif e.qq < 0 then
      v_resta := -e.qq;
      for i in 1..coalesce(array_length(v_anni, 1), 0) loop
        exit when v_resta <= 0;
        v_x := least(v_resta, greatest(0, v_rem[i]));
        if v_x > 0 then
          v_rem[i] := v_rem[i] - v_x; v_resta := v_resta - v_x;
          v_lotti := v_lotti || jsonb_build_object(v_anni[i]::text, coalesce((v_lotti ->> v_anni[i]::text)::numeric, 0) - v_x);
        end if;
      end loop;
      if v_resta > 0 then   -- più uscite che entrate (giacenza sotto zero): si toglie dall'anno di quel movimento
        v_anno := extract(year from e.d)::int;
        v_pos := array_position(v_anni, v_anno);
        if v_pos is null then
          v_anni := v_anni || v_anno; v_rem := v_rem || -v_resta;
          select array_agg(a order by a), array_agg(rr order by a) into v_anni, v_rem from unnest(v_anni, v_rem) x(a, rr);
        else
          v_rem[v_pos] := v_rem[v_pos] - v_resta;
        end if;
        v_lotti := v_lotti || jsonb_build_object(v_anno::text, coalesce((v_lotti ->> v_anno::text)::numeric, 0) - v_resta);
      end if;
    end if;
    n := v_n; data := e.d; movimento_id := e.mid; tipo := e.tp; nome := e.nm; stato := e.st; q := e.qq;
    prima := v_g; v_g := v_g + e.qq; dopo := v_g; lotti := v_lotti; ordinati := e.ord; prenotati := e.pren; a_sede := e.asede;
    return next;
  end loop;
end $$;

-- Lotti per anno di acquisto dell'articolo nella sede: Iniziale (a inizio anno), Caricata, Venduta, Altre uscite (quest'anno), Finale
create or replace function articolo_lotti(p_articolo uuid, p_sede text)
returns table (anno int, iniziale numeric, caricata numeric, venduta numeric, altre_uscite numeric, finale numeric)
language sql stable security invoker set search_path = public as $$
  with mov as (
    select f.data, f.tipo, (l.key)::int as anno, l.value::numeric as q
    from _articolo_fifo(p_articolo, p_sede) f, jsonb_each_text(f.lotti) l
  ), per_anno as (
    select mov.anno,
      sum(q) as finale,
      coalesce(sum(q) filter (where q > 0 and data >= date_trunc('year', current_date)), 0) as caricata,
      coalesce(-sum(q) filter (where q < 0 and data >= date_trunc('year', current_date) and tipo in ('vendite_giornaliere', 'scarico_cliente')), 0) as venduta,
      coalesce(-sum(q) filter (where q < 0 and data >= date_trunc('year', current_date) and tipo not in ('vendite_giornaliere', 'scarico_cliente')), 0) as altre
    from mov group by mov.anno
  )
  select per_anno.anno, finale - caricata + venduta + altre, caricata, venduta, altre, finale
  from per_anno
  where finale <> 0 or caricata <> 0 or venduta <> 0 or altre <> 0
  order by per_anno.anno;
$$;

-- Movimenti dell'articolo nella sede, dal più recente, una pagina alla volta
create or replace function articolo_movimenti(p_articolo uuid, p_sede text, p_da int default 0, p_quanti int default 50)
returns table (movimento_id bigint, data date, tipo text, nome text, stato text, q numeric, prima numeric, dopo numeric, lotti jsonb,
               ordinati numeric, prenotati numeric, totale bigint)
language sql stable security invoker set search_path = public as $$
  select f.movimento_id, f.data, f.tipo, f.nome, f.stato, f.q, f.prima, f.dopo, f.lotti, f.ordinati, f.prenotati, count(*) over ()
  from _articolo_fifo(p_articolo, p_sede) f
  order by f.n desc
  limit greatest(1, least(p_quanti, 300)) offset greatest(0, p_da);
$$;

-- Per ogni sede attiva: giacenza, in arrivo (ordini a fornitore definitivi non caricati + inevasi da una sede), prenotati
-- (ordini da cliente definitivi), disponibile previsto = giacenza + in arrivo − prenotati
create or replace function articolo_previsto(p_articolo uuid)
returns table (sede_id text, sede_nome text, giacenza numeric, in_arrivo numeric, prenotati numeric, previsto numeric)
language sql stable security invoker set search_path = public as $$
  with x as (
    select s.id, s.nome,
      coalesce((select g.quantita from giacenze g where g.sede_id = s.id and g.articolo_id = p_articolo), 0) as giac,
      coalesce((select sum(r.quantita) from movimenti_righe r join movimenti m on m.id = r.movimento_id left join fornitori f on f.id = m.fornitore_id
                where r.articolo_id = p_articolo and m.sede_id = s.id and m.tipo = 'ordine_fornitore' and m.stato = 'Definitivo' and f.sede_collegata is null), 0)
      + coalesce((select sum(i.residuo) from inevasi i where i.articolo_id = p_articolo and i.sede_richiedente = s.id and i.residuo > 0), 0) as arrivo,
      coalesce((select sum(r.quantita) from movimenti_righe r join movimenti m on m.id = r.movimento_id
                where r.articolo_id = p_articolo and m.sede_id = s.id and m.tipo = 'ordine_cliente' and m.stato = 'Definitivo'), 0) as pren
    from sedi s where s.attiva
  )
  select id, nome, giac, arrivo, pren, giac + arrivo - pren from x order by nome;
$$;

grant execute on function _articolo_fifo(uuid, text), articolo_lotti(uuid, text), articolo_movimenti(uuid, text, int, int), articolo_previsto(uuid) to authenticated;

-- Prima di salvare un articolo: codici quasi uguali (stessi caratteri a parte spazi, slash, trattini, punti) e barcode già usati.
-- Il controllo lo fa il database (gli articoli sono migliaia: la pagina non li legge tutti).
create or replace function articoli_simili(p_codice text, p_barcode text, p_escludi uuid default null)
returns table (codice text, descrizione text, motivo text)
language sql stable security invoker set search_path = public as $$
  select a.codice, a.descrizione, 'barcode' from articoli a
  where coalesce(p_barcode, '') <> '' and a.barcode = p_barcode and a.id is distinct from p_escludi
  union all
  select a.codice, a.descrizione, 'codice' from articoli a
  where coalesce(p_codice, '') <> '' and a.id is distinct from p_escludi
    and regexp_replace(upper(a.codice), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(p_codice), '[^A-Z0-9]', '', 'g')
  limit 20;
$$;
grant execute on function articoli_simili(text, text, uuid) to authenticated;

grant execute on function puo_scrivere_sede(text), ha_ruolo(text), salva_movimento_ed_evadi(bigint, jsonb, jsonb, bigint[]),
  conferma_ricezione(bigint), annulla_movimento(bigint), annulla_inevaso(bigint, numeric, text), aggiorna_documento_movimento(bigint, jsonb),
  conferma_inventario(bigint), nuovo_barcode(), salva_articolo(uuid, jsonb, timestamptz), salva_fornitore(uuid, jsonb, text[]),
  salva_cliente(uuid, jsonb), salva_utente(text, jsonb, boolean), registra_evento(text, text, text, text),
  giacenze_sede(text, text, boolean, boolean, int, int) to authenticated;
-- funzioni di servizio: non si chiamano dalle pagine
revoke execute on function _scrivi_anagrafica(text, text, jsonb, text[]), controlla_giacenza(text, uuid[]), blocca_articoli(text, uuid[]) from public, anon, authenticated;

-- Controllo: deve dare 21
select count(*) as funzioni_ok from information_schema.routines where routine_schema = 'public' and routine_name in (
  'puo_scrivere_sede', 'ha_ruolo', 'salva_movimento_ed_evadi', 'conferma_ricezione', 'annulla_movimento', 'annulla_inevaso',
  'aggiorna_documento_movimento', 'conferma_inventario', 'nuovo_barcode', 'salva_articolo', 'salva_fornitore', 'salva_cliente',
  'salva_utente', 'registra_evento', 'giacenze_sede', 'articoli_elenco', 'articoli_conteggi', 'articolo_lotti', 'articolo_movimenti', 'articolo_previsto', 'articoli_simili');
