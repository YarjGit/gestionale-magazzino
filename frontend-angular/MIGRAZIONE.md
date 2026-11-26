# Migrazione del gestionale da JavaScript puro ad Angular

Analisi del prototipo (`../prototipo/`, 61 pagine) e del database (`../database/01…31`), fatta il 26/11/2026.
Il prototipo resta il riferimento funzionale e continua a funzionare: non si modifica.

## 1. Cosa c'è nel database

**Tabelle:** `sedi` · `aliquote_iva` · `fornitori` (+ `fornitori_sedi`: fornitori usati da ogni sede) · `clienti` · `articoli`
(prezzi, ricarico, arrotondamento, materiali, attivo) · `tipi_movimento` (segno +1 / 0 / −1) · `movimenti` · `movimenti_righe`
(quantità, quantità contata, ordine_riga_id) · `inevasi_annullati` · `utenti_autorizzati` (ruoli, bloccato) · `registro_attivita`.

**Viste (sola lettura):** `giacenze` (somma dei movimenti Definitivi/Evasi; per chi riceve un trasferimento solo dopo la
conferma) · `inevasi` (righe d'ordine verso una sede: ordinata − trasferita − annullata).

**Funzioni (RPC):** `e_autorizzato()`, `e_amministratore()`, `salva_movimento(p_id, p_mov, p_righe)` (tutto-o-niente,
giacenza mai sotto zero, lucchetto per sede/articolo, CONFLITTO, GIORNATA_ESISTE, ORDINE_GIA_PREPARATO),
`scala_ordine_cliente(p_ordine)`. **Trigger:** registro attività automatico; prezzo in etichetta ai 10 centesimi.

**Movimenti (tipi):** carico da fornitore, ordine a fornitore, trasferimento a filiale (invio → ricezione), vendite
giornaliere (negozio ed e-commerce), ordine da cliente → scarico a cliente (DDT), aumento giacenza, diminuzione giacenza,
riallineamento (inventario), esistenza (giacenze iniziali importate), resi e altri carichi/scarichi (solo grafica).

## 2. Punti da mettere in sicurezza (scritture fatte dalla pagina invece che da una funzione SQL)

Le regole del database (RLS) oggi permettono a **ogni utente autorizzato** di scrivere direttamente su tutte le tabelle:
chi conosce il sito potrebbe saltare le funzioni e i loro controlli. Questi sono i punti del prototipo che lo fanno già:

| # | Dove | Cosa fa con `.update/.insert/.delete` dalla pagina | Rischio |
|---|------|------------------------------------------------------|---------|
| 1 | `js/movimenti-db.js` `confermaRicezioneDb` | Conferma ricezione di un trasferimento (`ricevuto_il`): **fa entrare la merce in giacenza** | Alto |
| 2 | `trasferimento.html` (Annulla trasferimento) | Mette il trasferimento `Annullato`: **la merce torna a chi l'ha mandata**; il blocco "già ricevuto" è solo nella pagina | Alto |
| 3 | `riallineamento.html` (Conferma inventario) | Le righe −giacenza / +contati sono **calcolate nella pagina** (poi salvate con `salva_movimento`); disattiva gli articoli e annulla l'inventario con `.update` | Alto |
| 4 | `trasferimento.html` dopo il salvataggio | Ordine della filiale → `Evaso` con un secondo `.update`, **separato** dal salvataggio del trasferimento (non tutto-o-niente) | Medio |
| 5 | `js/movimenti-db.js` `evadiOrdiniArrivatiDb` | Ordini a fornitore → `Evaso` dopo il carico, con `.update` separato | Medio |
| 6 | `js/movimenti-db.js` `annullaInevasoDb` | Cancellazione di un inevaso con `.insert` su `inevasi_annullati` | Medio |
| 7 | `ordine-cliente.html` | Ordine scalato: dati del documento e stato salvati con `.update` diretto su `movimenti` | Medio |
| 8 | `js/movimenti-db.js` `salvaMovimentoVecchio` | Riserva se manca `salva_movimento`: insert/delete diretti di movimenti e righe (oggi la funzione c'è) | Medio |
| 9 | `articolo.html` | Nuovo / modifica articolo con `.insert/.update` (prezzi; il trigger arrotonda il prezzo) | Basso |
| 10 | `fornitore.html`, `ordine-cliente.html` (nuovo cliente), `utenti-sito.html` | Anagrafiche con `.insert/.update/.upsert/.delete` (utenti: solo amministratori per RLS) | Basso |

Nota: `salva_movimento` e `scala_ordine_cliente` sono `security invoker`, cioè usano i permessi dell'utente. Per chiudere
le scritture dirette servono funzioni `security definer` con i loro controlli di permesso.

**Come metterli in sicurezza (proposta, senza rompere il prototipo):**
1. Nuovo script `database/33-funzioni-sicure.sql` con le funzioni che mancano: `conferma_ricezione(id)`,
   `annulla_movimento(id)` (rifiuta un trasferimento già ricevuto), trasferimento + ordine `Evaso` nella stessa transazione,
   `evadi_ordini_caricati(...)`, `annulla_inevaso(riga, quantita, motivo)`, `conferma_inventario(id)` (calcola **nel database**
   le differenze con la giacenza di quel momento e disattiva gli articoli eliminati), `salva_articolo`, `salva_fornitore`,
   `salva_cliente`, `salva_utente` (solo amministratori). Si aggiungono: il prototipo continua a funzionare com'è.
2. L'app Angular usa **solo** queste funzioni.
3. Quando il prototipo non serve più (o viene aggiornato per usarle), si tolgono le scritture dirette:
   `revoke insert, update, delete` su movimenti, righe, inevasi_annullati, articoli… per l'utente `authenticated`, e le funzioni
   diventano `security definer`.

## 3. Checklist delle schermate, nell'ordine migliore per migrarle

Ogni passo usa i pezzi di quelli prima. Le scritture passano solo da RPC (punto 2).

1. ✅ **Ossatura e accesso** – layout (menu laterale, barra in alto, tasto sede colorato, cambio sede → Dashboard), accesso con
   password o link via email, "non autorizzato", scelta sede, registro attività di accesso/uscita. *(core già pronto)*
2. ✅ **Articoli – elenco** (`articoli.html`): paginazione e ricerca lato server (codice, descrizione, barcode), filtri, campo
   pistola che cerca il barcode esatto. Da qui nascono i componenti condivisi: tabella paginata e ricerca articolo.
3. ✅ **Giacenze** (`giacenze.html`): giacenza della sede per articolo e lotti per anno, paginata.
4. ✅ **Scheda articolo** (`articolo.html`): dettagli, prezzo (costo, sconto, ricarico fisso, IVA, prezzo finale ai 10 cent),
   barcode creato dal database, materiali, giacenza per anno, altre sedi, movimenti. *Serve `salva_articolo`.*
5. ✅ **Anagrafiche**: sedi, fornitori (+ fornitori per sede), clienti, aliquote e tabelle di configurazione. *RPC di salvataggio.*
6. ✅ **Dashboard** (`dashboard.html`): merce in arrivo da confermare, ordini delle filiali da preparare, inevasi.
7. ✅ **Elenco movimenti comune** (`js/elenco.js`) e **Tutti i movimenti**: filtri, stati, ricerca, paginazione lato server.
8. ✅ **Vendite giornaliere** negozio ed e-commerce (`vendite-giornaliere.html`, `vendita.html`): una giornata al giorno,
   limite di giacenza, stampa mensile e-commerce.
9. ✅ **Aumento e diminuzione giacenza** (`aumento.html`, `diminuzione.html`).
10. ✅ **Carico da fornitore** (`carico.html`) con ordini collegati e ordini evasi nella stessa transazione.
11. ✅ **Ordine a fornitore** (`ordine.html`): fornitore obbligatorio, articoli in attesa (niente doppi ordini), giacenza dell'altra sede.
12. ✅ **Trasferimenti e inevasi** (`trasferimento.html`, trasferimenti a/da filiali, `inevasi.html`): preparazione dell'ordine
    di una filiale, invio, ricezione con conferma, annullamento. *Servono le funzioni dei punti 1, 2, 4, 6.*
13. ✅ **Ordini da cliente, DDT, scarico a cliente** (`ordine-cliente.html`, `stampa-ddt.html`).
14. ✅ **Inventario** (`riallineamento.html`, riallineamenti giacenza): conteggio con la pistola, non sparati, conferma nel database.
15. ✅ **Etichette e stampe** (`etichette.html`, `stampa-documento.html`): fogli A4 4×12, costo cifrato, doppia etichetta
    (solo CAL SMM Roma), carta intestata.
16. ✅ **Setup**: utenti sito e ruoli, attività utenti, impostazioni, pagine di configurazione rimanenti.

## 4. Stato (26/11/2026): tutte le 16 voci migrate

Ogni schermata ha la stessa logica del prototipo, scrive **solo** con funzioni del database e legge una pagina alla volta.
Le funzioni nuove sono in `../database/33-funzioni-sicure.sql` e `../database/34-funzioni-angular.sql` (già eseguiti).
Restano "in arrivo" nel menu le voci che nel prototipo sono solo grafica (resi, preventivi, altri carichi/scarichi, categorie,
gran parte di Configurazione e Setup) e, "in futuro", Laboratori ed e-commerce (vedi `ECOMMERCE.md`).

## 5. Verifica (prompt 4): atomicità, velocità, permessi per sede

| Controllo | Com'è adesso |
|-----------|--------------|
| **Tutto o niente** | Ogni salvataggio è una sola funzione del database: `salva_movimento`, `salva_carico` (carico + ordini Evasi), `salva_movimento_ed_evadi` (trasferimento + ordine Evaso), `conferma_ricezione`, `annulla_movimento`, `annulla_inevaso`, `conferma_inventario` (differenze calcolate nel database con la giacenza di quel momento), `scala_ordine_cliente`, `salva_articolo` / `salva_fornitore` / `salva_cliente` / `salva_utente`. Se qualcosa va storto non resta niente a metà. |
| **Giacenza** | Mai calcolata nella pagina per decidere: il database blocca la giacenza sotto zero (lucchetto per sede e articolo, anche con più computer insieme). La pagina la usa solo per avvisare prima. |
| **Lavoro da più computer** | Versione della scheda (`CONFLITTO`), giornata di vendite unica (`GIORNATA_ESISTE`: i miei articoli si aggiungono a quella dell'altro), ordine preparato una volta sola (`ORDINE_GIA_PREPARATO`), numeri di bolla e codici senza doppioni (lucchetti). |
| **Velocità** | Elenchi, ricerche e pistola fatti dal database a pagine (`articoli_elenco`, `giacenze_sede`, `movimenti_elenco`, `cerca_articoli`, `inevasi_dettaglio`…). Indici in `35-indici-e-controlli.sql` (anche ricerca "contiene" a trigrammi) e permessi calcolati una volta per richiesta. |
| **Permessi per sede** | `36-permessi-per-sede.sql`: tutti vedono tutto, ognuno modifica solo la sua sede (amministratori tutto). Eccezioni: chi riceve conferma l'arrivo; la sede che prepara l'ordine di una filiale lo mette Evaso. Controllo sulle tabelle (trigger): vale anche per il prototipo. Prima vanno spuntate le sedi di ogni persona in Utenti Sito. |
| **Scritture dirette** | La nuova versione non ne fa nessuna (controllato nel codice). `37-solo-funzioni.sql` le chiude del tutto per tutti: **solo quando il prototipo non si usa più**. |
| **Chiavi** | Nel codice c'è solo la chiave *publishable* (pubblica per natura). Nessuna chiave segreta né password. |
| **Spazio (piano gratuito 500 MB)** | Una riga di movimento pesa circa 100–150 byte: 500 MB bastano per milioni di righe. `spazio_database()` (solo amministratore) mostra quanto pesa ogni tabella. La tabella che cresce di più è `registro_attivita`: se un giorno servisse spazio si possono togliere gli accessi più vecchi (da decidere insieme, niente di automatico). Prima dell'uso quotidiano vero resta consigliato il piano Pro (backup giornalieri e niente pausa). |

## 6. Casi limite (prompt 5)

| Caso | Cosa succede |
|------|--------------|
| **Doppio clic su Salva** | Il tasto si blocca al primo clic (`conSalvataggio`); e anche con due computer il database salva una volta sola (versione, lucchetti, numero di bolla). |
| **Giacenza insufficiente** | Vendite, scarichi, diminuzioni e trasferimenti avvisano subito (riga rossa) e non salvano; se nel frattempo un altro computer ha venduto, il database rifiuta con "Giacenza insufficiente: codice (in giacenza N, ne mancano M)". |
| **Trasferimento verso la stessa sede** | La sede di lavoro non compare tra le sedi che ricevono; in più il database lo rifiuta (vincolo `trasferimento_non_a_se_stessa`, file 35). |
| **Ricevuto due volte / annullato dopo la ricezione** | `conferma_ricezione` e `annulla_movimento` lo rifiutano con un messaggio chiaro. |
| **Sessione scaduta** | Fuori da una modifica si torna all'accesso con "La sessione è scaduta". Durante una modifica la scheda resta aperta: si rientra da un'altra scheda del browser e si preme Salva (il lavoro non si perde). |
| **Connessione assente** | Messaggio "Connessione assente: controlla internet e riprova"; niente viene salvato a metà. |
| **Inventario in corso** | Avviso rosso in vendite, scarichi, diminuzioni e trasferimenti; la conferma solo per amministratore o responsabile magazzino (controllo nel database). |
| **Doppio ordine di articoli già in attesa** | Finestra "Va bene / Ne servono di più"; quelli aggiunti lo stesso hanno l'etichetta IN PIÙ. |

## 7. Cosa del prototipo si potrà togliere (prompt 6) — NON ancora

Il prototipo resta com'è finché la nuova versione non è in uso. Quando lo sarà:
- si potranno togliere `prototipo/*.html`, `prototipo/js/`, `prototipo/css/`, `prototipo/server.ps1` e `Avvia prototipo.bat`;
- **da tenere** (o spostare): `prototipo/img/logo-pddm.jpg` (ora anche in `frontend-angular/public/img/`), `prototipo/js/dati-articoli-reali.js` (solo PC di lavoro, non è su GitHub);
- `index.html` nella radice (rimanda al prototipo) andrà fatto puntare alla nuova versione;
- poi si esegue `database/37-solo-funzioni.sql`.
