-- ============================================================================================================
-- 38 – Inventario con l'anno di ogni pezzo (27/11/2026, deciso con l'utente per il primo inventario)
-- ============================================================================================================
-- Le quantità di oggi vengono dal vecchio gestionale e non sono affidabili: l'inventario SOSTITUISCE tutto.
--  - Ogni riga dell'inventario ha il suo anno di acquisto (movimenti_righe.anno_acquisto): si spara l'articolo (anno in corso)
--    e, se l'etichetta è di un anno vecchio, subito dopo il cartellino dell'anno (prototipo/cartellini-anni.html).
--  - Alla conferma, per ogni articolo: una riga toglie tutta la giacenza di adesso e una riga per anno mette i pezzi contati.
--  - "Tutto il magazzino": gli articoli con giacenza NON sparati vanno a zero (azione 'azzera', senza disattivarli),
--    tranne quelli segnati 'lascia' (restano come sono); 'elimina' = a zero e disattivato se le altre sedi non ne hanno.
--  - "Solo una parte": cambiano solo gli articoli sparati.
--  - Gli anni di acquisto (lotti) usano l'anno della riga, se c'è; nello stesso movimento prima le uscite, poi le entrate.
-- Si può rieseguire. Da incollare nel SQL Editor di Supabase dopo il 34.

alter table movimenti_righe add column if not exists anno_acquisto int;
alter table movimenti_righe drop constraint if exists azione_ammessa;
alter table movimenti_righe add constraint azione_ammessa check (azione is null or azione in ('elimina', 'lascia', 'azzera'));

-- ---------- Lotti per anno di acquisto: anno della riga, uscite prima delle entrate nello stesso movimento ----------
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
             coalesce(r.anno_acquisto, m.anno_acquisto, extract(year from m.data_movimento)::int) as lotto,
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
    ) ev order by ev.d, ev.mid, ev.qq
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

-- ---------- Conferma dell'inventario (sostituisce quella del 33) ----------
-- Restituisce { "contati": articoli contati, "azzerati": non sparati messi a zero, "lasciati": n, "eliminati": n,
--               "non_disattivati": [codici eliminati ma presenti in altre sedi] }.
create or replace function conferma_inventario(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m movimenti;
  v_tutto boolean;
  v_articoli uuid[];
  v_elimina uuid[];
  v_tenuti text[];
  v_contati int; v_azzerati int; v_lasciati int;
begin
  if not (ha_ruolo('amministratore') or ha_ruolo('responsabile_magazzino')) then
    raise exception 'Solo l''amministratore o il responsabile magazzino possono confermare l''inventario';
  end if;
  select * into m from movimenti where id = p_id for update;
  if not found or m.tipo <> 'riallineamento' then raise exception 'Inventario % non trovato', p_id; end if;
  if m.stato <> 'Provvisorio' then raise exception 'L''inventario non è in corso (è %)', m.stato; end if;
  if not puo_scrivere_sede(m.sede_id) then raise exception 'Utente non autorizzato a scrivere in questa sede'; end if;
  v_tutto := coalesce(m.motivo, '') <> 'Solo una parte';

  -- righe salvate durante il conteggio
  create temp table _inv_righe on commit drop as
    select articolo_id, coalesce(anno_acquisto, extract(year from current_date)::int) as anno,
           coalesce(quantita_contata, 0) as contati, azione, prezzo
    from movimenti_righe where movimento_id = p_id;
  -- articoli da toccare: contati ed eliminati; con "tutto il magazzino" anche tutti quelli con giacenza (tranne i "lascia")
  create temp table _inv_articoli on commit drop as
    select distinct articolo_id from _inv_righe where azione is null or azione = 'elimina'
    union
    select g.articolo_id from giacenze g
    where v_tutto and g.sede_id = m.sede_id and g.quantita <> 0
      and g.articolo_id not in (select articolo_id from _inv_righe where azione = 'lascia');
  select array_agg(articolo_id) into v_articoli from _inv_articoli;
  perform blocca_articoli(m.sede_id, coalesce(v_articoli, '{}'));

  -- giacenza di adesso (dopo i lucchetti) e pezzi contati per articolo
  create temp table _inv_conti on commit drop as
    select a.articolo_id,
           coalesce((select g.quantita from giacenze g where g.sede_id = m.sede_id and g.articolo_id = a.articolo_id), 0) as giac,
           coalesce((select sum(r.contati) from _inv_righe r where r.articolo_id = a.articolo_id and r.azione is null), 0) as contati,
           exists (select 1 from _inv_righe r where r.articolo_id = a.articolo_id and r.azione = 'elimina') as elimina,
           exists (select 1 from _inv_righe r where r.articolo_id = a.articolo_id and r.azione is null) as sparato,
           coalesce((select max(r.prezzo) from _inv_righe r where r.articolo_id = a.articolo_id), (select costo_netto from articoli where id = a.articolo_id), 0) as prezzo
    from _inv_articoli a;

  delete from movimenti_righe where movimento_id = p_id;
  -- 1) via tutta la giacenza di adesso
  insert into movimenti_righe (movimento_id, articolo_id, quantita, quantita_contata, azione, prezzo, etichette)
  select p_id, c.articolo_id, -c.giac, null,
         case when c.elimina and not c.sparato then 'elimina' when not c.sparato then 'azzera' end, c.prezzo, 0
  from _inv_conti c where c.giac <> 0 or not c.sparato;
  -- 2) i pezzi contati, una riga per anno di acquisto
  insert into movimenti_righe (movimento_id, articolo_id, quantita, quantita_contata, anno_acquisto, prezzo, etichette)
  select p_id, r.articolo_id, sum(r.contati), sum(r.contati), r.anno, max(r.prezzo), 0
  from _inv_righe r where r.azione is null group by r.articolo_id, r.anno having sum(r.contati) > 0;
  -- 3) promemoria dei non sparati lasciati come sono (non cambiano la giacenza)
  insert into movimenti_righe (movimento_id, articolo_id, quantita, azione, prezzo, etichette)
  select p_id, r.articolo_id, 0, 'lascia', max(r.prezzo), 0 from _inv_righe r where r.azione = 'lascia' group by r.articolo_id;

  update movimenti set stato = 'Definitivo', data_movimento = current_date, anno_acquisto = extract(year from current_date)::int,
         modificato_il = now(), modificato_da = auth.jwt() ->> 'email'
  where id = p_id;
  perform controlla_giacenza(m.sede_id, coalesce(v_articoli, '{}'));

  -- eliminati: disattivati solo se nessun'altra sede ne ha
  select array_agg(articolo_id) into v_elimina from _inv_conti where elimina and not sparato;
  select array_agg(a.codice order by a.codice) into v_tenuti
  from articoli a where a.id = any(coalesce(v_elimina, '{}'))
    and exists (select 1 from giacenze g where g.articolo_id = a.id and g.sede_id <> m.sede_id and g.quantita <> 0);
  update articoli set attivo = false, modificato_il = now()
  where id = any(coalesce(v_elimina, '{}'))
    and not exists (select 1 from giacenze g where g.articolo_id = articoli.id and g.sede_id <> m.sede_id and g.quantita <> 0);

  select count(*) into v_contati from _inv_conti where sparato;
  select count(*) into v_azzerati from _inv_conti where not sparato and not elimina;
  select count(distinct articolo_id) into v_lasciati from _inv_righe where azione = 'lascia';
  return jsonb_build_object('contati', v_contati, 'azzerati', v_azzerati, 'lasciati', v_lasciati,
                            'eliminati', coalesce(array_length(v_elimina, 1), 0), 'non_disattivati', coalesce(to_jsonb(v_tenuti), '[]'::jsonb));
end $$;
grant execute on function conferma_inventario(bigint) to authenticated;

-- Controllo: deve dare colonna_ok = true e vincolo_ok = true
select
  exists (select 1 from information_schema.columns where table_name = 'movimenti_righe' and column_name = 'anno_acquisto') as colonna_ok,
  exists (select 1 from pg_constraint where conname = 'azione_ammessa' and pg_get_constraintdef(oid) like '%azzera%') as vincolo_ok;
