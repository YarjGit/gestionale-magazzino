-- ============================================================================================================
-- 37 – Si scrive SOLO tramite le funzioni del database (nessuna scrittura diretta sulle tabelle dalla pagina)
--
-- ⛔ NON ESEGUIRLO finché si usa il PROTOTIPO (prototipo/): il prototipo scrive ancora direttamente su alcune tabelle
--    (articoli, fornitori, clienti, utenti, conferma ricevuto, inventario…) e smetterebbe di salvare.
--    Va eseguito il giorno in cui si passa definitivamente alla nuova versione (frontend-angular/), che usa solo funzioni.
--
-- Cosa fa:
--   1. toglie a chi entra dalla pagina (ruoli "authenticated" e "anon") il permesso di inserire, modificare e cancellare
--      righe nelle tabelle: restano solo le LETTURE (con le regole di sempre);
--   2. le funzioni che salvano diventano "security definer" (lavorano con i permessi del database, dopo aver fatto i loro controlli:
--      utente autorizzato, sede, giacenza mai sotto zero, versione della scheda, numero di bolla…).
-- Così nessuno può scavalcare le regole scrivendo direttamente con la chiave pubblica (che nel sito è visibile a tutti).
-- Per tornare indietro: la parte "PER TORNARE INDIETRO" in fondo.
-- ============================================================================================================

-- 1. Niente scritture dirette
revoke insert, update, delete on sedi, aliquote_iva, fornitori, fornitori_sedi, clienti, articoli, tipi_movimento,
  movimenti, movimenti_righe, inevasi_annullati, utenti_autorizzati, registro_attivita from authenticated, anon;

-- 2. Le funzioni che salvano lavorano con i permessi del database (i controlli li fanno loro, e i trigger del file 36)
alter function salva_movimento(bigint, jsonb, jsonb) security definer;
alter function scala_ordine_cliente(bigint) security definer;
alter function salva_carico(bigint, jsonb, jsonb, bigint[]) security definer;

-- Controllo: deve dare 0 (nessun permesso di scrittura diretta rimasto alla pagina)
select count(*) as scritture_dirette from information_schema.role_table_grants
where grantee in ('authenticated', 'anon') and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

-- ---------- PER TORNARE INDIETRO ----------
-- grant insert, update, delete on sedi, aliquote_iva, fornitori, fornitori_sedi, clienti, articoli, tipi_movimento,
--   movimenti, movimenti_righe, inevasi_annullati, utenti_autorizzati, registro_attivita to authenticated;
-- alter function salva_movimento(bigint, jsonb, jsonb) security invoker;
-- alter function scala_ordine_cliente(bigint) security invoker;
-- alter function salva_carico(bigint, jsonb, jsonb, bigint[]) security invoker;
