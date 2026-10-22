# Come funziona il gestionale attuale (studio del 22/10/2026)

Appunti presi navigando il gestionale attuale **in sola lettura** (nessun dato inserito o modificato).
Qui c'è solo la struttura: niente dati di clienti o fornitori (nomi, indirizzi, email). Gli importi negli esempi servono solo a spiegare i calcoli.

## Pagine (indirizzi interni)
Movimenti: ConsegneDaFornitori (Carichi), OrdiniInviati (Ordini a fornitori), TrasferimentiDaFiliali, ResiRicevuti,
RettificaAumentoGiacenza, AltriCarichi, VenditeGiornaliere, SpedizioniInviate (Scarichi a clienti), OrdiniRicevuti,
ResiInviati, TrasferimentiAFiliali, PreventiviInviati, RettificaDiminuzioneGiacenza, AltriScarichi,
RettificheInventario (Riallineamenti), TuttiMovimenti.
Magazzino: Articoli, Categorie, Sottocategorie, Giacenza. Laboratori: CaricoDaLaboratorio, InvioALaboratorio.
Ogni movimento è lo stesso tipo di scheda, cambia solo il "Tipo di movimento". Tipi esistenti:
Carico da laboratorio, Invio a laboratorio, Ordine a fornitore, Ordine da cliente, Preventivo inviato a cliente,
Reso inviato a fornitore, Trasferimento a filiale, Reso ricevuto da cliente, Trasferimento ricevuto da filiale,
Spedizione a cliente, Vendite giornaliere, Carico da fornitore, Rettifica aumento/diminuzione giacenza,
Riallineamento giacenza, Altro carico virtuale/reale, Altro scarico virtuale/reale.
Stati: Provvisorio, Definitivo, Evaso, Annullato.

## Dashboard
- "Ordini inviati da altri negozi": trasferimenti a filiale in arrivo da altre sedi (sede, numero, totale, data, n. articoli).
- "Movimenti da evadere o ancora in lavorazione": schede con fornitore, totale, tipo, data, stato e "Articoli N / M" (ordinati / arrivati).
- "Esamina consegna": tendina con le ultime consegne (data: fornitore, n. articoli).

## Scheda movimento (es. Vendita giornaliera)
Dettagli: Tipo di movimento, Stato, Aliquota IVA, Data documento, Progressivo, Porto, Sconto %, Causale (non stampata),
Annotazioni (stampate), Anno, Condizione pagamento, Spedizioniere, Tracking number, Tempo di consegna, ID.
Riepilogo: Totale articoli IVA inclusa, (spese), Totale complessivo. Nella vendita la causale contiene la data (20261021).
Articoli: # · Articolo (tendina con ricerca + icona modifica) · Ordinata · Spedita · Giac. (con ↻ ricalcola) ·
Anno giac. · Costo · IVA · Sconto % · Prezzo totale.
- **Vendite: Ordinata vuota, la quantità venduta è in Spedita.**
- Nelle vendite "Costo" è il prezzo di vendita **senza IVA con 4 decimali** (es. 30,3279) e "Prezzo totale" è con IVA (37,00).
- Nota in alto: "In questa pagina saranno indicati i PREZZI DI VENDITA" (verde) / "PREZZI DI ACQUISTO" (viola, ordini e carichi).

## Scheda articolo
Schede: Dettagli, Materiali, Giacenza, Giacenza altre sedi, Storico ordini, Storico modifiche. Pulsante "Ricalcola giacenza".
Dettagli: Disattivato · Codice · Descrizione · Provenienza (Magazzino centrale / Fornitori / Laboratorio) ·
Unità di misura (Numero, Metri, Litri, Chili, Paia, Conf., Dozz.) · Val. inventario · Fornitore 1 e Fornitore 2 ·
Barcode · Tipologia articolo (es. "Da magazzino") · Excel (listino Excel) · IVA · Costo · Costo + IVA · Sconto % ·
Ricarico % · Prezzo vendita + IVA · Pr. IVA inclusa arrotondato · Scorta minima · Scaffale · Varianti ·
Categoria · Sottocategoria · Anno listino · Anno prezzo unitario.
- Materiali: distinta dei materiali per i prodotti di laboratorio (Materiale, Fornitore, Quantità, Info aggiuntive, Costo totale).
- Giacenza (per anno): Q. iniziale, caricata, scaricata, finale + le stesse "virtuali" (ordini non ancora arrivati / impegni).
- Giacenza altre sedi: stessa tabella per ogni sede.
- Storico ordini: tutti i movimenti dell'articolo (numero, data, tipo, stato, carico +/−, giacenza prima => dopo,
  in ordine, **anno di acquisto**), con la riga "Giacenza a inizio anno" e il totale dell'anno.
- **La giacenza è tenuta per anno di acquisto** (colonna "Anno giac."): un riallineamento può spostare pezzi da un anno all'altro.

### Logica dei prezzi (dai nomi dei campi nello storico modifiche)
Campi: Prezzo unitario, Costo lordo, Costo netto, Costo confezione, Costo imballaggio, Spese accessorie, Spese totali,
Ricarico %, Prezzo vendita, Prezzo vendita IVA spese incluse, Arrotondamento prezzo vendita IVA inclusa.
Calcolo (verificato su un articolo):
  spese totali = confezione + imballaggio + accessorie
  prezzo vendita = (costo netto + spese totali) × (1 + ricarico%)          es. (16,65 + 5,4455) × 2 = 44,19
  prezzo vendita IVA spese incluse = prezzo vendita × (1 + IVA)              es. 44,19 × 1,22 = 53,91
  prezzo etichetta = arrotondato (qui + 0,09)                                 es. 54,00
Con ricarico 100% il costo è circa la metà del prezzo di vendita (era la domanda aperta sui prezzi).

## Scheda fornitore
Schede: Dettagli, Articoli, Storico modifiche. Pulsanti in lettura: Chiudi, Modifica.
Dettagli: Codice, Ragione sociale, Aliquota IVA, Partita IVA, Codice fiscale, Città, Provincia, CAP, Indirizzo,
Nazione, Telefono, Cellulare, Email, Archivio collegato (= sede collegata), allegati (file).
Articoli: Codice, Descrizione, Prezzo unitario, Categoria, Tipologia.

## Trasferimenti tra sedi
- Trasferimento a filiale: stessa scheda movimento; la sede che riceve è nel campo "Cliente". Schede: Dettagli,
  Movimenti collegati, Articoli, Riordini, Storico modifiche. Pulsanti in lettura: Etichette movimento, Stampa ▾, Excel, Chiudi, Modifica.
- Movimenti collegati: "È importante collegare le consegne e le spedizioni agli ordini corrispondenti (se presenti)
  così che vengano conteggiati come evasi per il computo della giacenza virtuale".
- Trasferimento da filiale (chi riceve): si registra come un carico con numero di bolla; il "fornitore" è la sede che manda
  (es. Magazzino Centrale, che è un fornitore con "Sede collegata"). In Dashboard compaiono i trasferimenti mandati
  dalle altre sedi ("Ordini inviati da altri negozi") da ricevere.

## Giacenze
Colonne: Articolo · Anno costo · Q. iniziale · Q. attuale · In ordine · Barcode.
- "Anno costo" elenca i lotti per anno di acquisto: "anno / quantità iniziale / quantità attuale" + il costo di quel lotto
  (es. "2025 / 2 / 0  18,50" e "2026 / 0 / 1"). → risponde alla domanda aperta sulle colonne anno.
- "In ordine": "(N Forn / M Cli)" = pezzi ordinati ai fornitori / pezzi ordinati dai clienti.
Filtri: Anno, Da codice, A codice, Provenienza, Senza costo, Sotto scorta. Pulsanti: Strumenti ▾, Inventario, Crea, Etichette.

## Riallineamento (inventario)
Righe: Articolo · differenza (es. −2) · giacenza · anno · costo (con avviso "Prezzo cambiato" se il costo dell'articolo
è cambiato) · IVA · sconto · totale. Nota viola "prezzi di acquisto".

## Tipi di movimento (Configurazione)
Codice, Descrizione, Codice contatore, Tipo anagrafica (Cliente / Fornitore / Inventario), Codice contatore magazzino,
Totale movimento. 30 tipi (es. 031 Carico da fornitore CAR, 032 Carico da lab. interni CARL, 038 Doni CARD,
010 Esistenza INV, 098 Rettifiche positive RPOS, 019 Reso da filiale, 014 Reso da visione, 017 Merce in conto deposito).

## Elenco articoli
Colonne: Codice, Descrizione, Provenienza, Giacenza, Costo/Prezzo, Barcode, Aliquota IVA.
Filtri: Fornitore, Da codice, A codice, Provenienza, Codice, Giacenza, Importato, Anno listino, Prezzo min/max, Solo giacenza.
