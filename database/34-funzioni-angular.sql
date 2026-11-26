-- ============================================================================================================
-- 34 – Funzioni di lettura per la nuova versione Angular (frontend-angular/), una per schermata.
-- Non cambia niente per il prototipo: aggiunge solo funzioni. Si può rieseguire quando il file si aggiorna
-- (create or replace). Da incollare nel SQL Editor di Supabase dopo il 33.
-- ============================================================================================================

-- ---------- Dashboard di una sede ----------
-- Tutto quello che la Dashboard del prototipo leggeva con tante richieste dalla pagina, calcolato qui in una volta:
--   in_arrivo   nostri ordini ancora da arrivare: ai fornitori (residuo = ordinato − caricato) e alle altre sedi (vista inevasi)
--   aperti      movimenti non ancora definitivi (Provvisorio, Riordino), della sede o in arrivo alla sede
--   sotto_scorta articoli con scorta minima e giacenza della sede sotto quella scorta
--   arrivi      trasferimenti mandati alla sede e non ancora confermati come ricevuti
--   ricevuti    ordini delle filiali a questa sede (Definitivi, da preparare) con quanti articoli sono disponibili ora
--   inevasi     ordini già preparati con articoli non ancora mandati (numero ordini e articoli)
create or replace function dashboard_sede(p_sede text) returns jsonb
language sql stable security invoker set search_path = public as $$
  with
  -- ordini ai fornitori esterni (o a questa stessa sede) ancora da caricare
  ord_forn as (
    select m.id, coalesce(m.protocollo, '#' || m.id) as prot, m.data_movimento as data, coalesce(f.ragione_sociale, '') as nome,
           count(*) as righe, sum(r.quantita - coalesce(c.arrivata, 0)) as pezzi
    from movimenti m
    left join fornitori f on f.id = m.fornitore_id
    join movimenti_righe r on r.movimento_id = m.id
    left join (
      select x.ordine_riga_id, sum(x.quantita) as arrivata from movimenti_righe x join movimenti mx on mx.id = x.movimento_id
      where mx.tipo = 'carico_fornitore' and mx.stato in ('Definitivo', 'Evaso') and x.ordine_riga_id is not null group by x.ordine_riga_id
    ) c on c.ordine_riga_id = r.id
    where m.tipo = 'ordine_fornitore' and m.sede_id = p_sede and m.stato in ('Provvisorio', 'Definitivo')
      and (f.sede_collegata is null or f.sede_collegata = p_sede)
      and r.quantita - coalesce(c.arrivata, 0) > 0
    group by m.id, f.ragione_sociale
  ),
  -- ordini alle altre sedi con articoli ancora da mandare
  ord_sedi as (
    select i.ordine_id as id, coalesce(i.protocollo, '#' || i.ordine_id) as prot, i.data_ordine as data, s.nome,
           count(*) as righe, sum(i.residuo) as pezzi
    from inevasi i left join sedi s on s.id = i.sede_fornitrice
    where i.sede_richiedente = p_sede and i.sede_fornitrice <> p_sede and i.residuo > 0
    group by i.ordine_id, i.protocollo, i.data_ordine, s.nome
  ),
  in_arrivo as (
    select id, prot, data, nome, righe, pezzi, 'Ordine a fornitore' as tipo from ord_forn
    union all
    select id, prot, data, nome, righe, pezzi, 'Ordine a sede' from ord_sedi
  ),
  aperti as (
    select m.id, m.tipo, t.nome as tipo_nome, m.stato, m.data_movimento as data,
           case when m.sede_id <> p_sede then (select nome from sedi where id = m.sede_id)
                when m.sede_altra_id is not null then (select nome from sedi where id = m.sede_altra_id)
                else coalesce((select nome from clienti where id = m.cliente_id), (select ragione_sociale from fornitori where id = m.fornitore_id), t.nome) end as nome,
           coalesce((select sum(totale) from movimenti_righe where movimento_id = m.id), 0) + m.spese as totale,
           coalesce((select sum(quantita) from movimenti_righe where movimento_id = m.id), 0) as pezzi,
           m.sede_id <> p_sede as in_arrivo
    from movimenti m join tipi_movimento t on t.codice = m.tipo
    where m.stato in ('Provvisorio', 'Riordino') and m.tipo <> 'esistenza'
      and (m.sede_id = p_sede or (m.tipo = 'trasferimento_a_filiale' and m.sede_altra_id = p_sede))
  ),
  arrivi as (
    select m.id, m.data_movimento as data, s.nome as da, count(r.id) as articoli, coalesce(sum(r.quantita), 0) as pezzi
    from movimenti m join sedi s on s.id = m.sede_id left join movimenti_righe r on r.movimento_id = m.id
    where m.tipo = 'trasferimento_a_filiale' and m.sede_altra_id = p_sede and m.stato in ('Definitivo', 'Evaso') and m.ricevuto_il is null
    group by m.id, s.nome
  ),
  ricevuti as (
    select i.ordine_id as id, s.nome as da, i.data_ordine as data, count(*) as righe, sum(i.ordinata) as pezzi,
           count(*) filter (where coalesce(g.quantita, 0) >= i.ordinata) as disponibili
    from inevasi i
    left join sedi s on s.id = i.sede_richiedente
    left join giacenze g on g.sede_id = p_sede and g.articolo_id = i.articolo_id
    where i.sede_fornitrice = p_sede and i.sede_richiedente <> p_sede and i.stato_ordine = 'Definitivo'
    group by i.ordine_id, s.nome, i.data_ordine
  ),
  inev as (
    select count(distinct ordine_id) as ordini, count(distinct articolo_id) as articoli
    from inevasi where sede_fornitrice = p_sede and sede_richiedente <> p_sede and stato_ordine = 'Evaso' and residuo > 0
  )
  select jsonb_build_object(
    'in_arrivo', coalesce((select jsonb_agg(to_jsonb(x) order by x.data, x.id) from in_arrivo x), '[]'),
    'aperti', coalesce((select jsonb_agg(to_jsonb(x) order by x.data desc, x.id desc) from aperti x), '[]'),
    'sotto_scorta', (select count(*) from articoli a left join giacenze g on g.articolo_id = a.id and g.sede_id = p_sede
                     where a.scorta_minima > 0 and a.attivo is not false and coalesce(g.quantita, 0) < a.scorta_minima),
    'arrivi', coalesce((select jsonb_agg(to_jsonb(x) order by x.data, x.id) from arrivi x), '[]'),
    'ricevuti', coalesce((select jsonb_agg(to_jsonb(x) order by x.data, x.id) from ricevuti x), '[]'),
    'inevasi', (select to_jsonb(x) from inev x)
  );
$$;
grant execute on function dashboard_sede(text) to authenticated;

-- ---------- Elenchi dei movimenti (carichi, ordini, trasferimenti, vendite, … e "Tutti i movimenti") ----------
-- Movimenti di una sede con i filtri della pagina, già pronti da mostrare: controparte, totali, pezzi, stato come lo vede
-- la sede (un trasferimento in arrivo è "Da ricevere" finché non si conferma, poi "Ricevuto").
--   p_tipo null = tutti i tipi della sede + i trasferimenti in arrivo ("Tutti i movimenti")
--   p_in_arrivo = trasferimenti mandati da altre sedi a questa (Trasferimenti da Filiali)
--   p_canale 'ecommerce' / 'negozio' = solo le giornate di vendite online / del negozio
create or replace function _movimenti_filtrati(p_sede text, p_tipo text, p_in_arrivo boolean, p_canale text, p_cerca text,
  p_dal date, p_al date, p_anno int, p_controparte text, p_articolo text)
returns table (id bigint, tipo text, tipo_nome text, segno int, stato text, stato_db text, protocollo text, numero_documento text,
  data_documento date, data date, data_bolla date, causale text, controparte text, colore text, tot_art numeric, totale numeric,
  pezzi numeric, ricevuti numeric, etichetta text, in_arrivo boolean)
language sql stable security invoker set search_path = public as $$
  with base as (
    select m.*, (m.sede_altra_id = p_sede and m.sede_id <> p_sede) as arrivo
    from movimenti m
    where case
      when p_in_arrivo then m.tipo = 'trasferimento_a_filiale' and m.sede_altra_id = p_sede
      when p_tipo is null then m.sede_id = p_sede or (m.tipo = 'trasferimento_a_filiale' and m.sede_altra_id = p_sede)
      else m.tipo = p_tipo and m.sede_id = p_sede end
      and (p_dal is null or m.data_movimento >= p_dal)
      and (p_al is null or m.data_movimento <= p_al)
      and (p_anno is null or (m.data_movimento >= make_date(p_anno, 1, 1) and m.data_movimento < make_date(p_anno + 1, 1, 1)))
      and (p_canale is null or (p_canale = 'ecommerce') = coalesce(m.causale ~* '^E-?COMMERCE', false))
      and (coalesce(p_articolo, '') = '' or exists (
        select 1 from movimenti_righe r join articoli a on a.id = r.articolo_id
        where r.movimento_id = m.id and (a.codice ilike '%' || p_articolo || '%' or a.descrizione ilike '%' || p_articolo || '%' or a.barcode = p_articolo)))
  ), x as (
    select b.id, case when b.arrivo then 'trasferimento_ricevuto' else b.tipo end as tipo,
      case when b.arrivo then 'Trasferimento da Filiale' else t.nome end as tipo_nome,
      (case when b.arrivo then 1 else t.segno end)::int as segno,
      case when b.arrivo and b.stato in ('Definitivo', 'Evaso') then case when b.ricevuto_il is null then 'Da ricevere' else 'Ricevuto' end
           else b.stato end as stato,
      b.stato as stato_db, b.protocollo, b.numero_documento, b.data_documento, b.data_movimento as data, b.data_bolla, b.causale,
      case when b.arrivo then sa.nome when b.sede_altra_id is not null then so.nome
           else coalesce(c.nome, f.ragione_sociale, '') end as controparte,
      case when b.arrivo then sa.colore when b.sede_altra_id is not null then so.colore end as colore,
      coalesce(rr.tot, 0)::numeric as tot_art, (coalesce(rr.tot, 0) + b.spese)::numeric as totale, coalesce(rr.pezzi, 0)::numeric as pezzi,
      (case when b.stato = 'Evaso' then coalesce(rr.pezzi, 0) else 0 end)::numeric as ricevuti,
      case when b.tipo = 'trasferimento_a_filiale' and not b.arrivo and b.stato in ('Definitivo', 'Evaso')
           then case when b.ricevuto_il is null then 'da confermare' else 'ricevuto' end end as etichetta,
      b.arrivo as in_arrivo
    from base b
    join tipi_movimento t on t.codice = b.tipo
    left join sedi sa on sa.id = b.sede_id
    left join sedi so on so.id = b.sede_altra_id
    left join clienti c on c.id = b.cliente_id
    left join fornitori f on f.id = b.fornitore_id
    left join lateral (select sum(r.totale) as tot, sum(r.quantita) as pezzi from movimenti_righe r where r.movimento_id = b.id) rr on true
  )
  select * from x
  where (coalesce(p_controparte, '') = '' or x.controparte ilike '%' || p_controparte || '%')
    and (coalesce(trim(p_cerca), '') = '' or not exists (
      select 1 from regexp_split_to_table(lower(trim(p_cerca)), '\s+') parola
      where position(parola in lower(concat_ws(' ', '#' || x.id, x.protocollo, x.numero_documento, x.controparte, x.causale, x.stato, x.etichetta))) = 0));
$$;

-- Una pagina dell'elenco (con il numero totale di righe in "righe_totali")
create or replace function movimenti_elenco(p_sede text, p_tipo text, p_in_arrivo boolean, p_canale text, p_cerca text,
  p_dal date, p_al date, p_anno int, p_controparte text, p_articolo text, p_stato text,
  p_ordina text, p_crescente boolean, p_da int, p_quanti int)
returns table (id bigint, tipo text, tipo_nome text, segno int, stato text, stato_db text, protocollo text, numero_documento text,
  data_documento date, data date, data_bolla date, causale text, controparte text, colore text, tot_art numeric, totale numeric,
  pezzi numeric, ricevuti numeric, etichetta text, in_arrivo boolean, righe_totali bigint)
language sql stable security invoker set search_path = public as $$
  select f.*, count(*) over () from _movimenti_filtrati(p_sede, p_tipo, p_in_arrivo, p_canale, p_cerca, p_dal, p_al, p_anno, p_controparte, p_articolo) f
  where p_stato is null or f.stato = p_stato
  order by
    case when p_crescente then case p_ordina when 'controparte' then f.controparte when 'causale' then f.causale when 'stato' then f.stato when 'tipo' then f.tipo_nome end end asc nulls last,
    case when not p_crescente then case p_ordina when 'controparte' then f.controparte when 'causale' then f.causale when 'stato' then f.stato when 'tipo' then f.tipo_nome end end desc nulls last,
    case when p_crescente then case p_ordina when 'totale' then f.totale when 'pezzi' then f.pezzi when 'tot_art' then f.tot_art end end asc nulls last,
    case when not p_crescente then case p_ordina when 'totale' then f.totale when 'pezzi' then f.pezzi when 'tot_art' then f.tot_art end end desc nulls last,
    case when p_crescente then case p_ordina when 'bolla' then f.data_bolla else f.data end end asc,
    case when not p_crescente then case p_ordina when 'bolla' then f.data_bolla else f.data end end desc,
    case when p_crescente then f.id end asc, case when not p_crescente then f.id end desc
  limit greatest(1, least(p_quanti, 500)) offset greatest(0, p_da);
$$;

-- Numeri delle schede in alto (per stato) e totali del piede, con gli stessi filtri (senza lo stato)
create or replace function movimenti_riepilogo(p_sede text, p_tipo text, p_in_arrivo boolean, p_canale text, p_cerca text,
  p_dal date, p_al date, p_anno int, p_controparte text, p_articolo text)
returns table (stato text, movimenti bigint, pezzi numeric, totale numeric)
language sql stable security invoker set search_path = public as $$
  select f.stato, count(*), coalesce(sum(f.pezzi), 0)::numeric, coalesce(sum(f.totale), 0)::numeric
  from _movimenti_filtrati(p_sede, p_tipo, p_in_arrivo, p_canale, p_cerca, p_dal, p_al, p_anno, p_controparte, p_articolo) f
  group by f.stato;
$$;

-- Carichi da Fornitori: ordini a fornitori (o alla sede stessa) con merce ancora da arrivare
create or replace function ordini_da_caricare(p_sede text)
returns table (id bigint, prot text, data date, stato text, fornitore text, righe bigint, pezzi numeric)
language sql stable security invoker set search_path = public as $$
  select m.id, coalesce(m.protocollo, '#' || m.id), m.data_movimento, m.stato, coalesce(f.ragione_sociale, ''),
         count(*), sum(r.quantita - coalesce(c.arrivata, 0))::numeric
  from movimenti m
  left join fornitori f on f.id = m.fornitore_id
  join movimenti_righe r on r.movimento_id = m.id
  left join (
    select x.ordine_riga_id, sum(x.quantita) as arrivata from movimenti_righe x join movimenti mx on mx.id = x.movimento_id
    where mx.tipo = 'carico_fornitore' and mx.stato in ('Definitivo', 'Evaso') and x.ordine_riga_id is not null group by x.ordine_riga_id
  ) c on c.ordine_riga_id = r.id
  where m.tipo = 'ordine_fornitore' and m.sede_id = p_sede and m.stato in ('Provvisorio', 'Definitivo')
    and (f.sede_collegata is null or f.sede_collegata = p_sede)
    and r.quantita - coalesce(c.arrivata, 0) > 0
  group by m.id, f.ragione_sociale
  order by m.data_movimento desc, m.id desc;
$$;

-- Trasferimenti a Filiali: ordini delle filiali a questa sede, ancora da preparare
create or replace function ordini_da_preparare(p_sede text)
returns table (id bigint, da text, data date, righe bigint, pezzi numeric, disponibili bigint)
language sql stable security invoker set search_path = public as $$
  select i.ordine_id, s.nome, i.data_ordine, count(*), sum(i.ordinata)::numeric,
         count(*) filter (where coalesce(g.quantita, 0) >= i.ordinata)
  from inevasi i
  left join sedi s on s.id = i.sede_richiedente
  left join giacenze g on g.sede_id = p_sede and g.articolo_id = i.articolo_id
  where i.sede_fornitrice = p_sede and i.sede_richiedente <> p_sede and i.stato_ordine = 'Definitivo'
  group by i.ordine_id, s.nome, i.data_ordine
  order by i.data_ordine, i.ordine_id;
$$;

-- Trasferimenti da Filiali: ordini di questa sede alle altre sedi ancora in attesa, con il trasferimento già partito da ricevere
create or replace function ordini_alle_sedi(p_sede text)
returns table (id bigint, prot text, data date, stato text, sede text, righe bigint, pezzi numeric, trasferimento_da_ricevere bigint)
language sql stable security invoker set search_path = public as $$
  select i.ordine_id, coalesce(i.protocollo, '#' || i.ordine_id), i.data_ordine, i.stato_ordine, s.nome, count(*), sum(i.residuo)::numeric,
    (select max(mt.id) from movimenti_righe rt join movimenti mt on mt.id = rt.movimento_id
     where rt.ordine_riga_id in (select i2.ordine_riga_id from inevasi i2 where i2.ordine_id = i.ordine_id)
       and mt.tipo = 'trasferimento_a_filiale' and mt.stato in ('Definitivo', 'Evaso') and mt.ricevuto_il is null)
  from inevasi i left join sedi s on s.id = i.sede_fornitrice
  where i.sede_richiedente = p_sede and i.sede_fornitrice <> p_sede and i.residuo > 0
  group by i.ordine_id, i.protocollo, i.data_ordine, i.stato_ordine, s.nome
  order by i.data_ordine desc, i.ordine_id desc;
$$;

-- Prodotti ordinati da questa sede ad altre sedi e non ancora partiti (scheda "In attesa", tasto INEVASI IN ATTESA)
create or replace function inevasi_in_attesa(p_sede text)
returns table (ordine_riga_id bigint, ordine_id bigint, data_ordine date, stato_ordine text, sede text, articolo_id uuid, codice text,
  descrizione text, ordinata numeric, trasferita numeric, residuo numeric)
language sql stable security invoker set search_path = public as $$
  select i.ordine_riga_id, i.ordine_id, i.data_ordine, i.stato_ordine, s.nome, i.articolo_id, a.codice, a.descrizione, i.ordinata::numeric, i.trasferita::numeric, i.residuo::numeric
  from inevasi i join articoli a on a.id = i.articolo_id left join sedi s on s.id = i.sede_fornitrice
  where i.sede_richiedente = p_sede and i.sede_fornitrice <> p_sede and i.residuo > 0
  order by i.data_ordine, i.ordine_riga_id;
$$;

grant execute on function _movimenti_filtrati(text, text, boolean, text, text, date, date, int, text, text),
  movimenti_elenco(text, text, boolean, text, text, date, date, int, text, text, text, text, boolean, int, int),
  movimenti_riepilogo(text, text, boolean, text, text, date, date, int, text, text),
  ordini_da_caricare(text), ordini_da_preparare(text), ordini_alle_sedi(text), inevasi_in_attesa(text) to authenticated;


-- Controllo: deve dare 8
select count(*) as funzioni_ok from information_schema.routines where routine_schema = 'public' and routine_name in ('dashboard_sede', '_movimenti_filtrati', 'movimenti_elenco', 'movimenti_riepilogo', 'ordini_da_caricare',
  'ordini_da_preparare', 'ordini_alle_sedi', 'inevasi_in_attesa');
