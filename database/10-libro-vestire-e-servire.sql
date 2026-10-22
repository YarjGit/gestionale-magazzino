-- "Vestire è servire" (Q11/05) è un libro: IVA 0% come gli altri libri (IVA già pagata dall'editore).
-- Il prezzo in etichetta (13,00) non cambia; senza IVA il prezzo di vendita è uguale a quello in etichetta.

update articoli
set aliquota_iva = '0',
    prezzo_vendita = prezzo_vendita_ivato,
    modificato_il = now()
where codice = 'Q11/05';

-- Controllo: deve dare una riga con aliquota_iva = 0 e prezzo 13,00
select codice, descrizione, aliquota_iva, prezzo_vendita, prezzo_vendita_ivato
from articoli
where codice = 'Q11/05';
