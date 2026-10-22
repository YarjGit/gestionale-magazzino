-- Cancella l'articolo Q11785/44 "VANG.MEDI PL.ARG/PELLE PRIMA C" (Vangelo medio, copertina argento/pelle), su richiesta dell'utente.
-- Per sicurezza lo cancella solo se non compare in nessun movimento (carichi, vendite, ordini…):
-- se c'è già un movimento, non viene toccato e conviene disattivarlo invece di cancellarlo.

delete from articoli a
where a.codice = 'Q11785/44'
  and not exists (select 1 from movimenti_righe r where r.articolo_id = a.id);

-- Controllo: deve dare 0 (articolo cancellato). Se dà 1, l'articolo ha dei movimenti e non è stato cancellato.
select count(*) as ancora_presente from articoli where codice = 'Q11785/44';
