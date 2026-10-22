-- Ricezione dei trasferimenti tra sedi (deciso con l'utente il 22/10/2026).
-- - Quando una sede (es. Magazzino Centrale) salva un Trasferimento a filiale Definitivo, la merce esce subito da lei.
-- - Il trasferimento compare in "Trasferimenti da Filiali" della sede che riceve (es. CAL SMM Roma) come "Da ricevere".
-- - Solo quando la sede che riceve preme "Conferma ricevuto" la merce entra nella sua giacenza.
-- Si può rieseguire.

-- 1) Chi e quando ha confermato l'arrivo
alter table movimenti add column if not exists ricevuto_il timestamptz;
alter table movimenti add column if not exists ricevuto_da text;

-- 2) I trasferimenti già fatti prima di questa regola restano come erano (merce già entrata nella giacenza)
update movimenti
set ricevuto_il = modificato_il, ricevuto_da = 'automatico (prima della conferma di ricezione)'
where tipo = 'trasferimento_a_filiale' and stato in ('Definitivo', 'Evaso') and ricevuto_il is null
  and creato_il < now();

-- 3) Giacenze: nella sede che riceve la merce entra solo dopo la conferma
create or replace view giacenze as
with variazioni as (
  select m.sede_id, r.articolo_id, r.quantita * t.segno as pezzi
  from movimenti_righe r
  join movimenti m on m.id = r.movimento_id
  join tipi_movimento t on t.codice = m.tipo
  where m.stato in ('Definitivo', 'Evaso')
  union all
  select m.sede_altra_id, r.articolo_id, r.quantita
  from movimenti_righe r
  join movimenti m on m.id = r.movimento_id
  where m.tipo = 'trasferimento_a_filiale' and m.stato in ('Definitivo', 'Evaso') and m.sede_altra_id is not null
    and m.ricevuto_il is not null
)
select sede_id, articolo_id, sum(pezzi)::numeric(12,2) as quantita
from variazioni
group by sede_id, articolo_id;
alter view giacenze set (security_invoker = on);
grant select on giacenze to authenticated;

-- Controllo: deve dare una riga con colonna_ok = true e da_ricevere = 0 (i vecchi trasferimenti sono già ricevuti)
select
  exists (select 1 from information_schema.columns where table_name = 'movimenti' and column_name = 'ricevuto_il') as colonna_ok,
  (select count(*) from movimenti where tipo = 'trasferimento_a_filiale' and stato in ('Definitivo', 'Evaso') and ricevuto_il is null) as da_ricevere;
