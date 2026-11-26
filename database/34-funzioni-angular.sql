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

-- Controllo: deve dare 1
select count(*) as funzioni_ok from information_schema.routines where routine_schema = 'public' and routine_name in ('dashboard_sede');
