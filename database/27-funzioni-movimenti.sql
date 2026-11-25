-- Regole importanti DENTRO il database (25/11/2026): prima le controllava solo la pagina nel browser.
--
--   salva_movimento(id, movimento, righe)  salva un movimento e le sue righe TUTTO O NIENTE (se qualcosa va storto non cambia niente);
--                                          non lascia andare sotto zero la giacenza della sede che manda/vende/scarica;
--                                          dà da solo il numero di bolla "N/anno" a ordini e scarichi a clienti, senza doppioni
--                                          anche se due persone salvano nello stesso momento.
--   scala_ordine_cliente(ordine)           crea lo scarico di un ordine da cliente UNA VOLTA SOLA (se c'è già, restituisce quello)
--                                          e mette l'ordine in Evaso, tutto insieme.
--
-- Le funzioni rispettano le stesse regole di accesso delle tabelle (solo utenti autorizzati). Le pagine le usano da sole;
-- finché questo file non è eseguito, le pagine continuano a salvare come prima. Si può rieseguire.

-- ---------- Salvataggio di un movimento ----------
create or replace function salva_movimento(p_id bigint, p_mov jsonb, p_righe jsonb)
returns bigint
language plpgsql security invoker set search_path = public as $$
declare
  v_id       bigint := p_id;
  v_sede     text;
  v_anno     text;
  v_cols     text;
  v_rcols    text;
  v_prima    jsonb;
  v_errore   text;
  v_toccate  int;
begin
  if not e_autorizzato() then
    raise exception 'Utente non autorizzato a salvare';
  end if;
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' then p_righe := '[]'::jsonb; end if;

  -- sede del movimento (per un movimento esistente quella salvata, se la pagina non la manda)
  v_sede := coalesce(p_mov ->> 'sede_id', (select sede_id from movimenti where id = p_id));

  -- Numero di bolla automatico "N/anno" per ordini e scarichi a clienti (una numerazione per sede e anno).
  -- Il "lucchetto" fa aspettare chi salva nello stesso istante: niente numeri doppi.
  if (p_mov ->> 'tipo') in ('ordine_cliente', 'scarico_cliente') and coalesce(trim(p_mov ->> 'numero_documento'), '') = '' then
    v_anno := left(coalesce(p_mov ->> 'data_bolla', p_mov ->> 'data_movimento', current_date::text), 4);
    perform pg_advisory_xact_lock(hashtext('bolla:' || v_sede || ':' || v_anno));
    p_mov := p_mov || jsonb_build_object('numero_documento',
      (select coalesce(max((regexp_match(numero_documento, '^(\d+)/'))[1]::int), 0) + 1
       from movimenti
       where tipo in ('ordine_cliente', 'scarico_cliente') and sede_id = v_sede and numero_documento like '%/' || v_anno)::text || '/' || v_anno);
  end if;

  -- Giacenza PRIMA del salvataggio degli articoli toccati, nella sede del movimento
  with toccati as (
    select (x ->> 'articolo_id')::uuid as articolo_id from jsonb_array_elements(p_righe) x
    union select articolo_id from movimenti_righe where movimento_id = p_id
  )
  select coalesce(jsonb_object_agg(g.articolo_id::text, g.quantita), '{}'::jsonb) into v_prima
  from giacenze g join toccati t on t.articolo_id = g.articolo_id
  where g.sede_id = v_sede;

  -- Movimento: solo le colonne che esistono (le altre mandate dalla pagina si ignorano)
  select string_agg(quote_ident(k), ', ') into v_cols
  from jsonb_object_keys(p_mov) k
  where k in (select column_name from information_schema.columns where table_schema = 'public' and table_name = 'movimenti')
    and k not in ('id', 'creato_il', 'creato_da', 'modificato_il');

  if v_id is null then
    execute format('insert into movimenti (%1$s, creato_da) select %1$s, $2 from jsonb_populate_record(null::movimenti, $1) returning id', v_cols)
      into v_id using p_mov, auth.jwt() ->> 'email';
  else
    execute format('update movimenti set (%1$s, modificato_il) = (select %1$s, now() from jsonb_populate_record(null::movimenti, $1)) where id = $2', v_cols)
      using p_mov, v_id;
    get diagnostics v_toccate = row_count;
    if v_toccate = 0 then raise exception 'Movimento % non trovato (o non modificabile)', v_id; end if;
    delete from movimenti_righe where movimento_id = v_id;
  end if;

  -- Righe: le colonne mandate dalla pagina (quelle che non manda prendono il valore normale)
  select string_agg(distinct quote_ident(k), ', ') into v_rcols
  from jsonb_array_elements(p_righe) e, jsonb_object_keys(e) k
  where k in (select column_name from information_schema.columns where table_schema = 'public' and table_name = 'movimenti_righe')
    and k not in ('id', 'movimento_id', 'totale');
  if v_rcols is not null then
    execute format('insert into movimenti_righe (%1$s, movimento_id) select %1$s, $2 from jsonb_populate_recordset(null::movimenti_righe, $1)', v_rcols)
      using p_righe, v_id;
  end if;

  -- Giacenza DOPO: non si può andare sotto zero (o più sotto di prima) nella sede del movimento.
  -- (Le giacenze già negative per errori del passato non bloccano i movimenti che non le peggiorano.)
  select string_agg(format('%s (in giacenza %s, ne mancano %s)', a.codice,
           greatest(coalesce((v_prima ->> g.articolo_id::text)::numeric, 0), 0), -g.quantita), '; ')
  into v_errore
  from giacenze g join articoli a on a.id = g.articolo_id
  where g.sede_id = v_sede
    and g.articolo_id in (select (x ->> 'articolo_id')::uuid from jsonb_array_elements(p_righe) x)
    and g.quantita < 0
    and g.quantita < coalesce((v_prima ->> g.articolo_id::text)::numeric, 0);
  if v_errore is not null then
    raise exception 'Giacenza insufficiente: %', v_errore;   -- tutto quello che è stato fatto qui sopra viene annullato
  end if;

  return v_id;
end $$;

-- ---------- Scarico di un ordine da cliente, una volta sola ----------
create or replace function scala_ordine_cliente(p_ordine bigint)
returns bigint
language plpgsql security invoker set search_path = public as $$
declare
  o     movimenti;
  v_id  bigint;
begin
  if not e_autorizzato() then raise exception 'Utente non autorizzato'; end if;
  -- l'ordine resta "chiuso a chiave" fino alla fine: due persone non possono scalarlo insieme
  select * into o from movimenti where id = p_ordine and tipo = 'ordine_cliente' for update;
  if not found then raise exception 'Ordine da cliente % non trovato', p_ordine; end if;
  if o.stato = 'Annullato' then raise exception 'L''ordine % è annullato', p_ordine; end if;

  -- già scalato? si restituisce lo scarico che c'è
  select m2.id into v_id
  from movimenti_righe r1
  join movimenti_righe r2 on r2.ordine_riga_id = r1.id
  join movimenti m2 on m2.id = r2.movimento_id
  where r1.movimento_id = p_ordine and m2.tipo = 'scarico_cliente' and m2.stato <> 'Annullato'
  limit 1;
  if v_id is not null then return v_id; end if;

  v_id := salva_movimento(null,
    jsonb_build_object('tipo', 'scarico_cliente', 'stato', 'Definitivo', 'sede_id', o.sede_id, 'cliente_id', o.cliente_id,
      'data_movimento', current_date, 'data_documento', coalesce(o.data_bolla, o.data_movimento),
      'numero_documento', o.numero_documento, 'data_bolla', o.data_bolla,
      'causale', 'Scarico dell''ordine da cliente #' || o.id, 'spese', 0),
    (select coalesce(jsonb_agg(jsonb_build_object('articolo_id', articolo_id, 'quantita', quantita, 'prezzo', prezzo,
              'sconto', sconto, 'etichette', 0, 'ordine_riga_id', id)), '[]'::jsonb)
     from movimenti_righe where movimento_id = p_ordine));

  update movimenti set stato = 'Evaso', modificato_il = now() where id = p_ordine and stato not in ('Evaso', 'Annullato');
  return v_id;
end $$;

grant execute on function salva_movimento(bigint, jsonb, jsonb) to authenticated;
grant execute on function scala_ordine_cliente(bigint) to authenticated;

-- Controllo: deve dare 2
select count(*) from information_schema.routines where routine_schema = 'public' and routine_name in ('salva_movimento', 'scala_ordine_cliente');
