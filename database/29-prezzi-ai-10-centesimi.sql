-- Prezzo di vendita finale (quello in etichetta) sempre ai 10 centesimi (deciso con l'utente il 25/11/2026):
-- fino a 10,04 → 10,00; da 10,05 → 10,10. La regola sta QUI nel database, così vale per tutto il gestionale
-- (scheda articolo, import, etichette, vendite) anche se una pagina se ne dimenticasse.
-- Si può rieseguire.

-- 1) Copia di sicurezza dei prezzi di oggi (per tornare indietro, se servisse)
create table if not exists copia_prezzi_20261125 as
select id, codice, prezzo_vendita_ivato, arrotondamento from articoli;
-- la copia non si legge dal sito (nessuna regola = nessun accesso dalle pagine)
alter table copia_prezzi_20261125 enable row level security;

-- 2) I prezzi già salvati diventano ai 10 centesimi. L'arrotondamento della scheda segue la stessa differenza,
--    così il calcolo (costo, ricarico, IVA) continua a tornare con il prezzo nuovo.
--    Il registro attività resta pulito: una riga sola invece di una per articolo.
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'registra' and tgrelid = 'articoli'::regclass) then
    alter table articoli disable trigger registra;
  end if;
end $$;
with cambiati as (
  update articoli
  set arrotondamento = arrotondamento + (round(prezzo_vendita_ivato, 1) - prezzo_vendita_ivato),
      prezzo_vendita_ivato = round(prezzo_vendita_ivato, 1)
  where prezzo_vendita_ivato <> round(prezzo_vendita_ivato, 1)
  returning id
)
insert into registro_attivita (email, sede, attivita, dettagli, tabella, riferimento)
select 'SQL Editor (Supabase)', null, 'Prezzi ai 10 centesimi',
       count(*) || ' articoli arrotondati (fino a ,04 in giù, da ,05 in su). Copia dei prezzi di prima: copia_prezzi_20261125', 'articoli', null
from cambiati;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'registra' and tgrelid = 'articoli'::regclass) then
    alter table articoli enable trigger registra;
  end if;
end $$;

-- 3) Da adesso ogni prezzo salvato viene arrotondato dal database
create or replace function prezzo_ai_10_centesimi() returns trigger
language plpgsql as $$
begin
  if new.prezzo_vendita_ivato is distinct from round(new.prezzo_vendita_ivato, 1) then
    new.arrotondamento := coalesce(new.arrotondamento, 0) + (round(new.prezzo_vendita_ivato, 1) - new.prezzo_vendita_ivato);
    new.prezzo_vendita_ivato := round(new.prezzo_vendita_ivato, 1);
  end if;
  return new;
end $$;
drop trigger if exists prezzo_ai_10_centesimi on articoli;
create trigger prezzo_ai_10_centesimi before insert or update of prezzo_vendita_ivato on articoli
  for each row execute function prezzo_ai_10_centesimi();

-- Controllo: deve dare prezzi_non_arrotondati = 0 e trigger_ok = true
select
  (select count(*) from articoli where prezzo_vendita_ivato <> round(prezzo_vendita_ivato, 1)) as prezzi_non_arrotondati,
  (select count(*) from copia_prezzi_20261125 c join articoli a on a.id = c.id where a.prezzo_vendita_ivato <> c.prezzo_vendita_ivato) as articoli_cambiati,
  exists (select 1 from pg_trigger where tgname = 'prezzo_ai_10_centesimi') as trigger_ok;
