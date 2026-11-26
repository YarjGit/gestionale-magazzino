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
-- (drop: la versione di prima non aveva fornitore_id e una funzione non può cambiare le colonne restituite)
drop function if exists ordini_da_caricare(text);
create or replace function ordini_da_caricare(p_sede text)
returns table (id bigint, prot text, data date, stato text, fornitore text, righe bigint, pezzi numeric, fornitore_id uuid)
language sql stable security invoker set search_path = public as $$
  select m.id, coalesce(m.protocollo, '#' || m.id), m.data_movimento, m.stato, coalesce(f.ragione_sociale, ''),
         count(*), sum(r.quantita - coalesce(c.arrivata, 0))::numeric, m.fornitore_id
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


-- ---------- Ricerca articoli per le righe dei movimenti (anche con la pistola) ----------
-- Come cercaArticoli del prototipo, ma nel database: ogni parola deve comparire (anche a metà) in codice, descrizione o barcode.
-- In cima il codice o il barcode esatto (la pistola prende sempre quello giusto), poi gli articoli del fornitore scelto,
-- poi i codici che iniziano col testo, quelli che lo contengono, infine il resto. Solo articoli attivi. Al massimo 50.
--   p_fornitore    fornitore della scheda (gli altri articoli si segnano "altro fornitore"); p_solo_fornitore = solo i suoi
--   p_sede_altra   sede di cui mostrare anche la giacenza (es. il Magazzino Centrale a cui si ordina)
create or replace function cerca_articoli(p_testo text, p_sede text, p_fornitore uuid default null, p_solo_fornitore boolean default false,
  p_sede_altra text default null, p_quanti int default 50)
returns table (id uuid, codice text, descrizione text, barcode text, fornitore_id uuid, costo_netto numeric, prezzo_vendita_ivato numeric,
  iva numeric, anno_listino int, unita_misura text, giacenza numeric, giacenza_altra numeric, altro_fornitore boolean, esatto boolean)
language sql stable security invoker set search_path = public as $$
  with t as (select lower(trim(coalesce(p_testo, ''))) as testo),
  parole as (select array_remove(regexp_split_to_array((select testo from t), '\s+'), '') as p),
  trovati as (
    select a.*,
      (lower(coalesce(a.barcode, '')) = (select testo from t) or lower(a.codice) = (select testo from t)) as e_esatto,
      case when lower(a.codice) like (select testo from t) || '%' then 1 when lower(a.codice) like '%' || (select testo from t) || '%' then 2 else 3 end as posto
    from articoli a
    where a.attivo is not false
      and (select testo from t) <> ''
      and not exists (select 1 from unnest((select p from parole)) w
                      where position(w in lower(a.codice || ' ' || coalesce(a.descrizione, '') || ' ' || coalesce(a.barcode, ''))) = 0)
      and (not p_solo_fornitore or p_fornitore is null or a.fornitore_id = p_fornitore or a.fornitore2_id = p_fornitore
           or lower(coalesce(a.barcode, '')) = (select testo from t) or lower(a.codice) = (select testo from t))
  )
  select x.id, x.codice, x.descrizione, x.barcode, x.fornitore_id, x.costo_netto::numeric, x.prezzo_vendita_ivato::numeric,
    coalesce(ai.aliquota, 22)::numeric, x.anno_listino::int, x.unita_misura,
    g.quantita::numeric, ga.quantita::numeric,
    (p_fornitore is not null and x.fornitore_id is distinct from p_fornitore and x.fornitore2_id is distinct from p_fornitore),
    x.e_esatto
  from trovati x
  left join aliquote_iva ai on ai.codice = x.aliquota_iva
  left join giacenze g on g.sede_id = p_sede and g.articolo_id = x.id
  left join giacenze ga on p_sede_altra is not null and ga.sede_id = p_sede_altra and ga.articolo_id = x.id
  order by x.e_esatto desc,
    (p_fornitore is not null and x.fornitore_id is distinct from p_fornitore and x.fornitore2_id is distinct from p_fornitore),
    x.posto, x.codice
  limit greatest(1, least(p_quanti, 100));
$$;

-- Giacenza attuale di alcuni articoli in una sede (righe di un movimento aperto)
create or replace function giacenze_articoli(p_sede text, p_articoli uuid[])
returns table (articolo_id uuid, quantita numeric)
language sql stable security invoker set search_path = public as $$
  select g.articolo_id, g.quantita::numeric from giacenze g where g.sede_id = p_sede and g.articolo_id = any(p_articoli);
$$;

grant execute on function cerca_articoli(text, text, uuid, boolean, text, int), giacenze_articoli(text, uuid[]) to authenticated;

-- ---------- Carico da fornitore collegato a ordini ----------
-- Salva il carico (salva_movimento: tutto o niente, versione, giacenza) e, se è Definitivo, mette "Evaso" gli ordini collegati
-- in cui è arrivato tutto (stessa transazione: nel prototipo era un secondo passaggio fatto dalla pagina).
create or replace function salva_carico(p_id bigint, p_mov jsonb, p_righe jsonb, p_ordini bigint[])
returns bigint
language plpgsql security invoker set search_path = public as $$
declare v_id bigint;
begin
  v_id := salva_movimento(p_id, p_mov, p_righe);
  if coalesce(p_mov ->> 'stato', '') = 'Definitivo' and coalesce(array_length(p_ordini, 1), 0) > 0 then
    update movimenti m set stato = 'Evaso', modificato_il = now(), modificato_da = auth.jwt() ->> 'email'
    where m.id = any(p_ordini) and m.tipo = 'ordine_fornitore' and m.stato in ('Provvisorio', 'Definitivo')
      and not exists (
        select 1 from movimenti_righe r
        where r.movimento_id = m.id
          and r.quantita > coalesce((select sum(x.quantita) from movimenti_righe x join movimenti mx on mx.id = x.movimento_id
                                     where x.ordine_riga_id = r.id and mx.tipo = 'carico_fornitore' and mx.stato in ('Definitivo', 'Evaso')), 0));
  end if;
  return v_id;
end $$;

-- Righe ancora da arrivare di un ordine a fornitore (per riempire il carico: "Spedita = quanto manca")
create or replace function ordine_da_caricare_righe(p_ordine bigint)
returns table (ordine_riga_id bigint, articolo_id uuid, prezzo numeric, ordinata numeric, arrivata numeric, residuo numeric)
language sql stable security invoker set search_path = public as $$
  select r.id, r.articolo_id, r.prezzo::numeric, r.quantita::numeric, coalesce(c.arrivata, 0)::numeric, (r.quantita - coalesce(c.arrivata, 0))::numeric
  from movimenti_righe r
  left join (select x.ordine_riga_id, sum(x.quantita) as arrivata from movimenti_righe x join movimenti mx on mx.id = x.movimento_id
             where mx.tipo = 'carico_fornitore' and mx.stato in ('Definitivo', 'Evaso') and x.ordine_riga_id is not null group by x.ordine_riga_id) c
    on c.ordine_riga_id = r.id
  where r.movimento_id = p_ordine and r.quantita - coalesce(c.arrivata, 0) > 0
  order by r.id;
$$;

grant execute on function salva_carico(bigint, jsonb, jsonb, bigint[]), ordine_da_caricare_righe(bigint) to authenticated;

-- ---------- Inevasi con articolo e giacenza (trasferimento da ordine, pagina Inevasi) ----------
-- Righe d'ordine delle filiali a una sede fornitrice con quello che manca ancora da mandare, l'articolo e la giacenza
-- della sede fornitrice. Filtri facoltativi: un ordine, alcune righe, una filiale, solo ordini già preparati (Evasi).
-- Un ordine di una sede a se stessa non è un ordine di una filiale e non compare.
create or replace function inevasi_dettaglio(p_sede_fornitrice text, p_ordine bigint default null, p_righe bigint[] default null,
  p_richiedente text default null, p_solo_evasi boolean default false)
returns table (ordine_riga_id bigint, ordine_id bigint, protocollo text, data_ordine date, stato_ordine text, sede_richiedente text, nome_richiedente text,
  articolo_id uuid, codice text, descrizione text, barcode text, costo_netto numeric, prezzo_vendita_ivato numeric, iva numeric, anno_listino int,
  unita_misura text, giacenza numeric, ordinata numeric, trasferita numeric, annullata numeric, residuo numeric)
language sql stable security invoker set search_path = public as $$
  select i.ordine_riga_id, i.ordine_id, i.protocollo, i.data_ordine, i.stato_ordine, i.sede_richiedente, s.nome,
    a.id, a.codice, a.descrizione, a.barcode, a.costo_netto::numeric, a.prezzo_vendita_ivato::numeric, coalesce(ai.aliquota, 22)::numeric,
    a.anno_listino::int, a.unita_misura, coalesce(g.quantita, 0)::numeric, i.ordinata::numeric, i.trasferita::numeric, i.annullata::numeric, i.residuo::numeric
  from inevasi i
  join articoli a on a.id = i.articolo_id
  left join aliquote_iva ai on ai.codice = a.aliquota_iva
  left join sedi s on s.id = i.sede_richiedente
  left join giacenze g on g.sede_id = p_sede_fornitrice and g.articolo_id = i.articolo_id
  where i.sede_fornitrice = p_sede_fornitrice and i.sede_richiedente <> p_sede_fornitrice and i.residuo > 0
    and (p_ordine is null or i.ordine_id = p_ordine)
    and (p_righe is null or i.ordine_riga_id = any(p_righe))
    and (p_richiedente is null or i.sede_richiedente = p_richiedente)
    and (not p_solo_evasi or i.stato_ordine = 'Evaso')
  order by i.data_ordine, i.ordine_riga_id;
$$;
grant execute on function inevasi_dettaglio(text, bigint, bigint[], text, boolean) to authenticated;

-- ---------- Registro degli inevasi cancellati (pagina Inevasi, scheda "Cancellati") ----------
-- Cancellazioni delle righe d'ordine in cui la sede è chi manda o chi ha ordinato, dalla più recente.
create or replace function inevasi_annullati_sede(p_sede text)
returns table (id bigint, annullato_il timestamptz, annullato_da text, quantita numeric, motivo text, ordine_id bigint, codice text, descrizione text, filiale text)
language sql stable security invoker set search_path = public as $$
  select x.id, x.annullato_il, x.annullato_da, x.quantita::numeric, x.motivo, m.id, a.codice, a.descrizione, s.nome
  from inevasi_annullati x
  join movimenti_righe r on r.id = x.ordine_riga_id
  join movimenti m on m.id = r.movimento_id
  join articoli a on a.id = r.articolo_id
  left join fornitori f on f.id = m.fornitore_id
  left join sedi s on s.id = m.sede_id
  where m.sede_id = p_sede or f.sede_collegata = p_sede
  order by x.annullato_il desc
  limit 500;
$$;
grant execute on function inevasi_annullati_sede(text) to authenticated;

-- Controllo: deve dare 14
select count(*) as funzioni_ok from information_schema.routines where routine_schema = 'public' and routine_name in ('dashboard_sede', '_movimenti_filtrati', 'movimenti_elenco', 'movimenti_riepilogo', 'ordini_da_caricare',
  'ordini_da_preparare', 'ordini_alle_sedi', 'inevasi_in_attesa', 'cerca_articoli', 'giacenze_articoli',
  'salva_carico', 'ordine_da_caricare_righe', 'inevasi_dettaglio', 'inevasi_annullati_sede');
