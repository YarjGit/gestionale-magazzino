-- Lavoro da più computer nello stesso momento (25/11/2026). Aggiorna salva_movimento (database/27-funzioni-movimenti.sql) così che:
--
--  1. Ultimo pezzo venduto da due computer insieme: chi salva per secondo aspetta il primo e poi trova la giacenza giusta
--     (un "lucchetto" per sede e articolo): non si va sotto zero.
--  2. Stessa scheda modificata da due computer: chi salva per secondo NON cancella il lavoro dell'altro. Il database se ne accorge
--     (versione della scheda) e risponde "CONFLITTO": la pagina ricarica e, per le vendite, unisce da sola gli articoli nuovi.
--  3. Giornata di vendite di oggi (negozio o e-commerce) creata da due computer insieme: la seconda non nasce doppia ("GIORNATA_ESISTE"),
--     la pagina aggiunge i suoi articoli a quella già creata. Si può fare una seconda giornata solo con la nota (come già nella pagina).
--  4. Stesso ordine di una filiale preparato da due computer (trasferimento / inevasi): non si manda più del dovuto ("ORDINE_GIA_PREPARATO"),
--     a meno che chi prepara abbia confermato di mandare di più.
--
-- Si può rieseguire.

alter table movimenti add column if not exists modificato_da text;

create or replace function salva_movimento(p_id bigint, p_mov jsonb, p_righe jsonb)
returns bigint
language plpgsql security invoker set search_path = public as $$
declare
  v_id       bigint := p_id;
  v_vecchio  movimenti;
  v_sede     text;
  v_tipo     text;
  v_stato    text;
  v_data     date;
  v_anno     text;
  v_cols     text;
  v_rcols    text;
  v_prima    jsonb;
  v_errore   text;
  v_toccate  int;
  v_altra    bigint;
  v_ecom     boolean;
  v_chiave   text;
  v_email    text := auth.jwt() ->> 'email';
begin
  if not e_autorizzato() then
    raise exception 'Utente non autorizzato a salvare';
  end if;
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' then p_righe := '[]'::jsonb; end if;

  -- 2. Movimento esistente: lo si "chiude a chiave" e si controlla che nessuno l'abbia cambiato dopo che la pagina l'ha aperto
  if p_id is not null then
    select * into v_vecchio from movimenti where id = p_id for update;
    if not found then raise exception 'Movimento % non trovato', p_id; end if;
    if p_mov ? '_versione' and p_mov ->> '_versione' is not null
       and date_trunc('milliseconds', (p_mov ->> '_versione')::timestamptz) <> date_trunc('milliseconds', v_vecchio.modificato_il) then
      raise exception 'CONFLITTO|%|%', coalesce(v_vecchio.modificato_da, v_vecchio.creato_da, 'un altro computer'),
        to_char(v_vecchio.modificato_il at time zone 'Europe/Rome', 'DD/MM HH24:MI');
    end if;
  end if;

  v_sede  := coalesce(p_mov ->> 'sede_id', v_vecchio.sede_id);
  v_tipo  := coalesce(p_mov ->> 'tipo', v_vecchio.tipo);
  v_stato := coalesce(p_mov ->> 'stato', v_vecchio.stato);
  v_data  := coalesce((p_mov ->> 'data_movimento')::date, v_vecchio.data_movimento, current_date);

  -- 3. Una giornata di vendite per giorno, per il negozio e per l'e-commerce (salvo seconda giornata con la nota: _doppia_ok)
  if v_tipo = 'vendite_giornaliere' and v_stato <> 'Annullato' and coalesce((p_mov ->> '_doppia_ok')::boolean, false) = false then
    v_ecom := coalesce(p_mov ->> 'causale', v_vecchio.causale, '') ~* '^E-?COMMERCE';
    perform pg_advisory_xact_lock(hashtext('giornata:' || v_sede || ':' || v_data || ':' || v_ecom));
    select id into v_altra from movimenti
    where tipo = 'vendite_giornaliere' and sede_id = v_sede and data_movimento = v_data and stato <> 'Annullato'
      and (coalesce(causale, '') ~* '^E-?COMMERCE') = v_ecom and id is distinct from p_id
    order by id limit 1;
    -- conta come doppione solo se questa giornata non ha già la sua nota che la distingue (causale diversa da quella normale)
    if v_altra is not null and (p_id is null or coalesce(v_vecchio.causale, '') !~ ' – ') and coalesce(p_mov ->> 'causale', '') !~ ' – ' then
      raise exception 'GIORNATA_ESISTE|%', v_altra;
    end if;
  end if;

  -- Numero di bolla automatico "N/anno" per ordini e scarichi a clienti (una numerazione per sede e anno), senza doppioni
  if v_tipo in ('ordine_cliente', 'scarico_cliente') and coalesce(trim(coalesce(p_mov ->> 'numero_documento', v_vecchio.numero_documento)), '') = '' then
    v_anno := left(coalesce(p_mov ->> 'data_bolla', p_mov ->> 'data_movimento', current_date::text), 4);
    perform pg_advisory_xact_lock(hashtext('bolla:' || v_sede || ':' || v_anno));
    p_mov := p_mov || jsonb_build_object('numero_documento',
      (select coalesce(max((regexp_match(numero_documento, '^(\d+)/'))[1]::int), 0) + 1
       from movimenti
       where tipo in ('ordine_cliente', 'scarico_cliente') and sede_id = v_sede and numero_documento like '%/' || v_anno)::text || '/' || v_anno);
  end if;

  -- 1. Lucchetti per sede e articolo (sempre nello stesso ordine, così due salvataggi non si bloccano a vicenda),
  --    e per le righe d'ordine che si stanno preparando (punto 4)
  for v_chiave in
    select distinct k from (
      select 'art:' || v_sede || ':' || (x ->> 'articolo_id') as k from jsonb_array_elements(p_righe) x
      union select 'art:' || v_sede || ':' || articolo_id::text from movimenti_righe where movimento_id = p_id
      union select 'ordriga:' || (x ->> 'ordine_riga_id') from jsonb_array_elements(p_righe) x where x ->> 'ordine_riga_id' is not null
    ) t order by k
  loop
    perform pg_advisory_xact_lock(hashtext(v_chiave));
  end loop;

  -- Giacenza PRIMA del salvataggio degli articoli toccati, nella sede del movimento (letta dopo i lucchetti: è quella vera)
  with toccati as (
    select (x ->> 'articolo_id')::uuid as articolo_id from jsonb_array_elements(p_righe) x
    union select articolo_id from movimenti_righe where movimento_id = p_id
  )
  select coalesce(jsonb_object_agg(g.articolo_id::text, g.quantita), '{}'::jsonb) into v_prima
  from giacenze g join toccati t on t.articolo_id = g.articolo_id
  where g.sede_id = v_sede;

  -- Movimento: solo le colonne che esistono (le altre, come _versione, si ignorano)
  select string_agg(quote_ident(k), ', ') into v_cols
  from jsonb_object_keys(p_mov) k
  where k in (select column_name from information_schema.columns where table_schema = 'public' and table_name = 'movimenti')
    and k not in ('id', 'creato_il', 'creato_da', 'modificato_il', 'modificato_da');

  if v_id is null then
    execute format('insert into movimenti (%1$s, creato_da, modificato_da) select %1$s, $2, $2 from jsonb_populate_record(null::movimenti, $1) returning id', v_cols)
      into v_id using p_mov, v_email;
  else
    execute format('update movimenti set (%1$s, modificato_il, modificato_da) = (select %1$s, now(), $3 from jsonb_populate_record(null::movimenti, $1)) where id = $2', v_cols)
      using p_mov, v_id, v_email;
    get diagnostics v_toccate = row_count;
    if v_toccate = 0 then raise exception 'Movimento % non trovato (o non modificabile)', v_id; end if;
    delete from movimenti_righe where movimento_id = v_id;
  end if;

  -- Righe
  select string_agg(distinct quote_ident(k), ', ') into v_rcols
  from jsonb_array_elements(p_righe) e, jsonb_object_keys(e) k
  where k in (select column_name from information_schema.columns where table_schema = 'public' and table_name = 'movimenti_righe')
    and k not in ('id', 'movimento_id', 'totale');
  if v_rcols is not null then
    execute format('insert into movimenti_righe (%1$s, movimento_id) select %1$s, $2 from jsonb_populate_recordset(null::movimenti_righe, $1)', v_rcols)
      using p_righe, v_id;
  end if;

  -- Giacenza DOPO: non si può andare sotto zero (o più sotto di prima) nella sede del movimento
  select string_agg(format('%s (in giacenza %s, ne mancano %s)', a.codice,
           greatest(coalesce((v_prima ->> g.articolo_id::text)::numeric, 0), 0), -g.quantita), '; ')
  into v_errore
  from giacenze g join articoli a on a.id = g.articolo_id
  where g.sede_id = v_sede
    and g.articolo_id in (select (x ->> 'articolo_id')::uuid from jsonb_array_elements(p_righe) x)
    and g.quantita < 0
    and g.quantita < coalesce((v_prima ->> g.articolo_id::text)::numeric, 0);
  if v_errore is not null then
    raise exception 'Giacenza insufficiente: %', v_errore;
  end if;

  -- 4. Ordine di una filiale: con questo trasferimento non si manda più di quanto resta da mandare
  --    (se chi prepara ha confermato di mandare di più, la pagina manda _oltre_ok)
  if v_tipo = 'trasferimento_a_filiale' and v_stato in ('Definitivo', 'Evaso') and coalesce((p_mov ->> '_oltre_ok')::boolean, false) = false then
    select string_agg(format('%s (mancavano %s)', a.codice, i.residuo + r.quantita), '; ') into v_errore
    from movimenti_righe r
    join inevasi i on i.ordine_riga_id = r.ordine_riga_id
    join articoli a on a.id = r.articolo_id
    where r.movimento_id = v_id and r.ordine_riga_id is not null and i.residuo < 0;
    if v_errore is not null then
      raise exception 'ORDINE_GIA_PREPARATO|%', v_errore;
    end if;
  end if;

  return v_id;
end $$;

grant execute on function salva_movimento(bigint, jsonb, jsonb) to authenticated;

-- Controllo: deve dare 1
select count(*) from information_schema.columns where table_name = 'movimenti' and column_name = 'modificato_da';
