-- ============================================================================================================
-- 39 – Inevasi anche dei fornitori (27/11/2026, deciso con l'utente)
-- ============================================================================================================
-- Prima gli inevasi c'erano solo per gli ordini alle sedi (es. CAL SMM Roma → Magazzino Centrale: quello che il Magazzino
-- Centrale non manda resta "inevaso"). Ora vale anche per gli ordini ai fornitori esterni, per TUTTE le sedi:
--  - quando si salva Definitivo un carico collegato a un ordine, l'ordine diventa "Evaso" anche se è arrivato solo in parte;
--  - quello che manca resta negli INEVASI DEL FORNITORE (vista inevasi_fornitori): quando il fornitore manda il resto si fa un
--    carico scegliendo gli inevasi (righe collegate con ordine_riga_id), oppure si cancellano con un motivo (inevasi_annullati).
-- Non cambia niente di quello che c'è già (vista "inevasi" delle sedi compresa). Si può rieseguire. Da incollare dopo il 38.

-- ---------- Vista: articoli ordinati ai fornitori esterni, in ordini già Evasi, non ancora arrivati ----------
-- residuo = ordinata − arrivata (carichi Definitivi/Evasi collegati alla riga) − cancellata
create or replace view inevasi_fornitori as
select r.id                                   as ordine_riga_id,
       m.id                                   as ordine_id,
       m.protocollo,
       m.data_movimento                       as data_ordine,
       m.stato                                as stato_ordine,
       m.sede_id                              as sede_richiedente,
       m.fornitore_id,
       f.ragione_sociale                      as fornitore,
       r.articolo_id,
       r.prezzo,
       r.quantita                             as ordinata,
       coalesce(c.arrivata, 0)                as arrivata,
       coalesce(a.annullata, 0)               as annullata,
       r.quantita - coalesce(c.arrivata, 0) - coalesce(a.annullata, 0) as residuo
from movimenti_righe r
join movimenti m on m.id = r.movimento_id
left join fornitori f on f.id = m.fornitore_id
left join (
  select x.ordine_riga_id, sum(x.quantita) as arrivata
  from movimenti_righe x join movimenti mx on mx.id = x.movimento_id
  where mx.tipo = 'carico_fornitore' and mx.stato in ('Definitivo', 'Evaso') and x.ordine_riga_id is not null
  group by x.ordine_riga_id
) c on c.ordine_riga_id = r.id
left join (
  select ordine_riga_id, sum(quantita) as annullata from inevasi_annullati group by ordine_riga_id
) a on a.ordine_riga_id = r.id
where m.tipo = 'ordine_fornitore' and m.stato = 'Evaso'
  and (f.sede_collegata is null or f.sede_collegata = m.sede_id);   -- gli ordini alle altre sedi restano nella vista "inevasi"
alter view inevasi_fornitori set (security_invoker = on);
grant select on inevasi_fornitori to authenticated;

-- ---------- Cancellazione di un inevaso: anche di un fornitore (la sede che aspetta la merce) ----------
create or replace function annulla_inevaso(p_riga bigint, p_quantita numeric, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_residuo numeric; v_sede text;
begin
  perform pg_advisory_xact_lock(hashtext('ordriga:' || p_riga));
  -- inevaso di un ordine a una sede: lo cancella la sede che deve mandare la merce
  select residuo, sede_fornitrice into v_residuo, v_sede from inevasi where ordine_riga_id = p_riga;
  if not found then
    -- inevaso di un fornitore esterno: lo cancella la sede che ha fatto l'ordine (la merce non arriverà più)
    select residuo, sede_richiedente into v_residuo, v_sede from inevasi_fornitori where ordine_riga_id = p_riga;
    if not found then raise exception 'Inevaso non trovato'; end if;
  end if;
  if not puo_scrivere_sede(v_sede) then raise exception 'Utente non autorizzato a cancellare questo inevaso'; end if;
  if p_quantita is null or p_quantita <= 0 then raise exception 'Quantità da cancellare non valida'; end if;
  if p_quantita > v_residuo then raise exception 'Si possono cancellare al massimo % pezzi', v_residuo; end if;
  insert into inevasi_annullati (ordine_riga_id, quantita, motivo, annullato_da)
  values (p_riga, p_quantita, nullif(trim(p_motivo), ''), auth.jwt() ->> 'email');
end $$;
grant execute on function annulla_inevaso(bigint, numeric, text) to authenticated;

-- ---------- Carico (nuova versione): gli ordini collegati diventano Evasi anche se arrivati in parte ----------
-- quello che manca resta negli inevasi del fornitore (vista qui sopra)
create or replace function salva_carico(p_id bigint, p_mov jsonb, p_righe jsonb, p_ordini bigint[])
returns bigint
language plpgsql security invoker set search_path = public as $$
declare v_id bigint;
begin
  v_id := salva_movimento(p_id, p_mov, p_righe);
  if coalesce(p_mov ->> 'stato', '') = 'Definitivo' and coalesce(array_length(p_ordini, 1), 0) > 0 then
    update movimenti m set stato = 'Evaso', modificato_il = now(), modificato_da = auth.jwt() ->> 'email'
    where m.id = any(p_ordini) and m.tipo = 'ordine_fornitore' and m.stato in ('Provvisorio', 'Definitivo');
  end if;
  return v_id;
end $$;
grant execute on function salva_carico(bigint, jsonb, jsonb, bigint[]) to authenticated;

-- ---------- Ricezione di un trasferimento con articoli NON arrivati (anche dalle sedi) ----------
-- Chi riceve, prima di "Conferma ricevuto", segna gli articoli non arrivati e per ognuno sceglie:
--   'inevaso'  = torna negli inevasi: la riga del trasferimento si riduce, la merce resta (torna) nella giacenza di chi manda
--                e, se il trasferimento era per un ordine, l'articolo ricompare tra gli inevasi da mandare;
--   'cancella' = come sopra, ma l'inevaso dell'ordine si cancella con il motivo (non arriverà più).
-- p_mancanti: [{ "riga": id riga del trasferimento, "quantita": pezzi non arrivati, "scelta": "inevaso"|"cancella", "motivo": "…" }]
-- Il motivo va anche nelle annotazioni del trasferimento. Tutto o niente, poi la conferma di ricezione.
-- Le funzioni sicure possono scrivere sulle righe dell'altra sede (controllo dei permessi qui dentro, non nei trigger del 36)
create or replace function _da_controllare() returns boolean
language sql stable set search_path = public as $$
  select coalesce(current_setting('gestionale.funzione_sicura', true), '') <> '1'
     and coalesce(auth.jwt() ->> 'role', '') = 'authenticated';
$$;

create or replace function ricevi_con_mancanti(p_id bigint, p_mancanti jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare m movimenti; x jsonb; r movimenti_righe; v_q numeric; v_note text := ''; v_cod text;
begin
  select * into m from movimenti where id = p_id for update;
  if not found or m.tipo <> 'trasferimento_a_filiale' then raise exception 'Trasferimento % non trovato', p_id; end if;
  if not puo_scrivere_sede(m.sede_altra_id) then raise exception 'Solo la sede che riceve può confermare l''arrivo'; end if;
  if m.stato not in ('Definitivo', 'Evaso') then raise exception 'Il trasferimento non è ancora stato spedito (è %)', m.stato; end if;
  if m.ricevuto_il is not null then raise exception 'Trasferimento già ricevuto il %', to_char(m.ricevuto_il at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI'); end if;
  perform set_config('gestionale.funzione_sicura', '1', true);
  for x in select * from jsonb_array_elements(coalesce(p_mancanti, '[]'::jsonb)) loop
    select * into r from movimenti_righe where id = (x ->> 'riga')::bigint and movimento_id = p_id for update;
    if not found then raise exception 'Riga % non trovata nel trasferimento', x ->> 'riga'; end if;
    v_q := round(coalesce((x ->> 'quantita')::numeric, 0), 2);
    if v_q <= 0 then continue; end if;
    if v_q > r.quantita then raise exception 'Non arrivati: al massimo % pezzi per questa riga', r.quantita; end if;
    if coalesce(x ->> 'scelta', 'inevaso') = 'cancella' and coalesce(trim(x ->> 'motivo'), '') = '' then
      raise exception 'Scrivi il motivo per gli articoli che non arriveranno più';
    end if;
    if v_q = r.quantita then delete from movimenti_righe where id = r.id;
    else update movimenti_righe set quantita = quantita - v_q where id = r.id; end if;
    if x ->> 'scelta' = 'cancella' and r.ordine_riga_id is not null then
      insert into inevasi_annullati (ordine_riga_id, quantita, motivo, annullato_da)
      values (r.ordine_riga_id, v_q, trim(x ->> 'motivo'), auth.jwt() ->> 'email');
    end if;
    select codice into v_cod from articoli where id = r.articolo_id;
    v_note := v_note || E'\n' || '- ' || coalesce(v_cod, '?') || ': ' || v_q || ' non arrivati'
      || case when x ->> 'scelta' = 'cancella' then ' (non arriveranno più)' else ' (negli inevasi)' end
      || coalesce(' – ' || nullif(trim(x ->> 'motivo'), ''), '');
  end loop;
  update movimenti set ricevuto_il = now(), ricevuto_da = auth.jwt() ->> 'email', modificato_il = now(),
         annotazioni = case when v_note = '' then annotazioni
                            else concat_ws(E'\n', nullif(annotazioni, ''), 'Alla ricezione:' || v_note) end
  where id = p_id;
end $$;
grant execute on function ricevi_con_mancanti(bigint, jsonb) to authenticated;

-- Controllo: deve dare una riga con vista_ok = true
select exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'inevasi_fornitori') as vista_ok;
