-- Ora di ogni riga (24/11/2026): nelle vendite e-commerce ogni vendita aggiunta durante il giorno resta una riga a sé con la sua ora.
-- Si può rieseguire.
alter table movimenti_righe add column if not exists aggiunto_il timestamptz;

-- Controllo: deve dare 1
select count(*) from information_schema.columns where table_name = 'movimenti_righe' and column_name = 'aggiunto_il';
