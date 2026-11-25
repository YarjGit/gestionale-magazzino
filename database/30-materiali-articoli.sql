-- Materiali di un articolo (scheda articolo → Materiali, 25/11/2026): per ogni articolo l'elenco dei materiali usati
-- per farne un pezzo (es. prodotti fatti in laboratorio). Ogni riga: materiale, fornitore, quantità, info aggiuntive, costo.
-- Salvati insieme all'articolo, come elenco: [{ "materiale": "...", "fornitore": "...", "quantita": 1.5, "info": "...", "costo": 3.2 }]
-- Si può rieseguire.

alter table articoli add column if not exists materiali jsonb not null default '[]'::jsonb;

-- Controllo: deve dare colonna_ok = true
select exists (select 1 from information_schema.columns where table_name = 'articoli' and column_name = 'materiali') as colonna_ok;
