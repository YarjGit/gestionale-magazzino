-- =====================================================================
-- Da eseguire DOPO aver importato articoli.csv e fornitori.csv.
-- Sostituisci LA-TUA-EMAIL con l'indirizzo Google con cui entrerai nel gestionale.
-- =====================================================================

-- Chi può entrare: tu come amministratore (aggiungi altre righe per i colleghi)
insert into utenti_autorizzati (email, nome, ruolo)
values ('LA-TUA-EMAIL', 'Amministratore', 'amministratore')
on conflict (email) do nothing;

-- Il fornitore "MAGAZZINO CENTRALE" è la sede Magazzino Centrale
update fornitori set sede_collegata = 'magazzino-centrale' where codice = '900009';

-- Celle vuote dell'import -> "nessun valore"
update fornitori set partita_iva = null where partita_iva = '';
update fornitori set codice_fiscale = null where codice_fiscale = '';
update articoli set barcode = null where barcode = '';

-- Controllo finale: quanti dati ci sono
select 'articoli' as tabella, count(*) from articoli
union all select 'fornitori', count(*) from fornitori
union all select 'aliquote_iva', count(*) from aliquote_iva
union all select 'sedi', count(*) from sedi
union all select 'utenti_autorizzati', count(*) from utenti_autorizzati;
