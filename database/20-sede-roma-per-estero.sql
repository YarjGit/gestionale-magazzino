-- Attiva la sede "CAL Roma per Estero" (nel gestionale attuale "Apostolato Liturgico Roma per Estero"):
-- qui si caricano e si preparano gli ordini che chiedono le sedi estere; nella causale si scrive il paese di spedizione.
update sedi set attiva = true where id = 'cal-roma-estero';

select id, nome, attiva from sedi where attiva order by nome;
