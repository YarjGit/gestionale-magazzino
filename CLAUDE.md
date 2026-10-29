# Gestionale Magazzino

Rifacimento del gestionale di magazzino dell'utente (17 sedi in Italia, negozi "CAL" + laboratori e magazzino centrale).
Oggi il gestionale attuale è usato solo da **CAL SMM Roma** e **Magazzino Centrale**: si parte da queste due sedi, le altre verranno aggiunte dopo.
L'utente parla italiano e non è un programmatore: rispondere in italiano, semplice, senza gergo.

## Cosa fa e cosa no
- Serve solo a tenere sotto controllo il magazzino: carichi, ordini, trasferimenti tra filiali, vendite giornaliere come scarico, giacenze, etichette.
- Fatturazione elettronica (SDI) e scontrini/corrispettivi restano al commercialista: niente XML, niente registratore telematico. I documenti sono proforma/PDF interni su carta intestata.
- Login uguale per tutti (Google); la sede di lavoro si sceglie dopo l'accesso e si cambia dal tasto colorato in alto.
- **Ogni sede vede prodotti e movimenti di tutte le altre, senza limitazioni** (scelta dell'utente): niente filtri di sicurezza per sede, solo l'elenco di chi può entrare.
- Nelle sedi si usa una **pistola laser barcode** (si comporta come una tastiera: scrive il codice e preme Invio) per etichette, vendite e inventario. I barcode stampati devono essere veri: EAN-13 se la cifra di controllo è giusta, altrimenti Code 128 (vedi `prototipo/js/barcode.js`). Ogni campo "aggiungi articolo" deve accettare la pistola.
- Rimandati al futuro: collegamento all'e-commerce (Setup → Utenti Sito) e menu Laboratori. Restano nel menu con l'etichetta "in futuro".

## Come lavoriamo
- L'utente manda uno screenshot per ogni schermata del gestionale attuale; si rifà la schermata **simile ma mai identica**: cambiare sempre qualcosa nella grafica e dire cosa è cambiato.
- Prima la grafica (prototipo), la logica si decide insieme dopo. I pulsanti che salvano o stampano mostrano un avviso.
- **Prezzi sempre con due decimali**: arrotondare prezzi unitari e totali al centesimo (anche quelli scritti a mano).
- **IVA**: 22% per tutto, 4% solo per le ostie, 0% per i libri (codici Q, IVA pagata dall'editore) e per le sedi estere (`SEDI_ESTERE` in `js/sedi.js`).
- **Giacenza per anno di acquisto**; l'anno di carico si stampa su ogni etichetta prezzo, con il costo d'acquisto cifrato (M=1 A=2 G=3 I=4 S=5 T=6 E=7 R=8 P=9 D=0, es. 19,00 → MP-DD) e il prezzo. Fogli A4 4 × 12, barcode ~9 mm. I trasferimenti tra sedi entrano in automatico nella giacenza di chi riceve. Regole complete: `PROGETTO.md` → "Regole decise".
- Misure come il gestionale reale: righe tabella ~41 px, voci menu ~38 px, titolo 18 px (non "zoomato").
- Domande aperte e prossimi passi: `PROGETTO.md`.
- Come funziona il gestionale attuale (schede, campi, giacenze per anno di acquisto, calcolo dei prezzi): `STUDIO-GESTIONALE.md`. Leggerlo prima di rifare una schermata.

## Gestionale attuale (da studiare, mai da modificare)
- Indirizzo: https://gestionale.pddm.it:10443/apostolato-liturgico-smm-roma (accesso con Google).
- **Usare il Chrome dell'utente** (estensione "Claude in Chrome", strumenti `mcp__claude-in-chrome__*`), **non** il browser integrato dell'app:
  così le visite sembrano quelle solite dell'utente (stesso browser, stesso indirizzo). Deciso dall'utente il 22/10/2026.
  Se Claude in Chrome non è disponibile, dirlo e chiedere prima di usare altro.
- L'accesso lo fa **l'utente** (di solito in Chrome è già dentro): mai chiedere né scrivere password.
- **Solo lettura**: non inserire, modificare o cancellare record ("se no fai un caos nel database"); mai premere Salva/Crea/Elimina.
  Non toccare pulsanti che fanno azioni da soli: "Ricalcola giacenza", "Inventario", "Controlla traduzioni", voci di menu "Strumenti".
- **Andare piano, come una persona**: una pagina alla volta, 4-6 secondi tra un'apertura e l'altra (il server si blocca con troppe richieste).
  Leggere la pagina già aperta (testo, campi) non chiede niente al server.
- Gli appunti con dati reali restano in `riferimenti/`; in `STUDIO-GESTIONALE.md` solo la struttura.

## Schede movimento
- Righe articolo comuni a tutte le schede (＋, cestino, frecce, − / +, IVA per riga, pistola): `js/righe-movimento.js`.
  Schede: `carico.html`, `ordine.html` (fornitore obbligatorio, articoli del fornitore), `vendita.html` (quantità solo in Spedita, prezzi IVA inclusa).
- **Ordini → carichi**: in Carichi da Fornitori il riquadro "Ordini a fornitori da caricare" (ordini aperti, esclusi quelli a una sede) apre `carico.html?nuovo=1&ordine=N`:
  fornitore e ordine già collegati, Spedita = quanto manca, poi − / +, sconto per riga e ✕. "Nuovo carico" resta per i carichi senza ordine.
  Allo stesso modo in Trasferimenti da Filiali il riquadro "Ordini alle sedi in attesa" (ordini della sede a un fornitore-sede, es. SMM → Magazzino Centrale):
  "Vedi ordine" finché non parte, "Ricevi" (apre il trasferimento collegato con `ordine_riga_id`) quando è partito. Stile comune `.ordini-da-caricare` in `css/elenco.css`.
- `trasferimento.html?nuovo=1&ordine=N` (dalla Dashboard del Magazzino Centrale o dal riquadro in Trasferimenti a Filiali): sopra gli articoli disponibili dell'ordine,
  sotto, separati, i nuovi inevasi e quelli accumulati dagli ordini precedenti della stessa filiale (si spuntano per mandarli); tasto "Stampa nota" (nota di preparazione).
  Prezzo tra filiali = **prezzo d'acquisto** (costo); un eventuale ricarico si deciderà più avanti.
- **Niente doppi ordini**: una filiale non deve riordinare quello che è già in attesa (inevasi o ordini non ancora preparati).
  In `ordine.html` verso un fornitore-sede: riquadro "Già in attesa" e l'articolo in attesa non entra (finestra "Va bene / Ne servono di più";
  i pezzi aggiunti lo stesso hanno l'etichetta IN PIÙ, anche nel trasferimento del Magazzino Centrale). Tasto "INEVASI IN ATTESA" in Ordini a Fornitori.
- **Ricezione dei trasferimenti** (`database/15-ricezione-trasferimenti.sql`): il trasferimento Definitivo toglie subito la merce a chi manda;
  chi riceve lo trova "Da ricevere" in Trasferimenti da Filiali e in Dashboard, lo apre (`trasferimento.html?db=N`), stampa le etichette e preme
  "Conferma ricevuto" (`ricevuto_il`, `ricevuto_da`): solo allora la merce entra nella sua giacenza. Dopo la ricezione chi manda non può più annullare.
- `inevasi.html`: elenco degli ordini con inevasi (tasto INEVASI in Trasferimenti a Filiali e in Dashboard) → `?filiale=…&ordine=N` inevasi della filiale divisi per data dell'ordine, da spuntare per preparare il trasferimento.
- Sede **CAL Roma per Estero** (nel vecchio "Apostolato Liturgico Roma per Estero", `database/20-sede-roma-per-estero.sql`): carichi e ordini per le sedi estere, nella causale il paese di spedizione (stampato nelle Note). Carichi con IVA 22% come le altre: non è in `SEDI_ESTERE`. Alle sedi estere si passa la merce al costo + IVA, senza ricarico; il compenso per il servizio non è in bolla.
- `aumento.html` (elenco `aumento-giacenza.html`): merce che entra senza fornitore. Motivo a riquadri (Inventario, Da altri centri o sedi chiuse,
  Donazione, Altro), **anno di acquisto scelto a mano** (anche passato: si stampa sulle etichette), prezzi di acquisto, quantità in "Arrivata".
  Colonne `motivo` e `anno_acquisto` in `database/16-aumento-giacenza.sql`.
- Scheda articolo `articolo.html?cod=…` con calcolo del prezzo: (costo netto + spese) × (1 + ricarico) + IVA + arrotondamento.

## Struttura
- `prototipo/` – il prototipo HTML/CSS/JS, senza build. Si apre con `Avvia prototipo.bat` (server PowerShell su http://localhost:8080).
  - `js/layout.js` menu laterale, barra in alto, scelta sede; `js/elenco.js` modello comune delle pagine elenco movimenti; `js/anagrafica.js` modello delle tabelle di Configurazione/Setup.
  - `js/dati-*.js` dati di esempio; `carico.html` scheda carico (vedi `?id=8815`, nuovo `?nuovo=1`); `etichette.html` stampa etichette.
- `riferimenti/` – screenshot del gestionale attuale: contengono dati reali, **non pubblicarli** (esclusi da `.gitignore`, esistono solo sul PC di lavoro).
- Online (GitHub Pages, pubblico, dalla radice del ramo `main`): https://yarjgit.github.io/gestionale-magazzino/ → `index.html` rimanda a `prototipo/login.html`.

## Due PC (lavoro e casa) con GitHub
L'utente lavora da due PC e usa GitHub solo dal sito: Git lo usa Claude.
- **All'inizio di ogni sessione:** `git pull` per avere l'ultima versione (l'utente lo chiede con "aggiorna da GitHub").
  Se la cartella non c'è ancora su quel PC: `git clone https://github.com/YarjGit/gestionale-magazzino.git "Gestionale Magazzino"` sul Desktop.
- **A fine lavoro (o quando l'utente lo chiede):** commit con messaggio in italiano e `git push` su `origin main`. Il sito si aggiorna da solo in 1–2 minuti.
- Il repository è **pubblico**: prima di ogni commit controllare che non entrino dati reali (screenshot, export JSON, email, IBAN, matricole).
- Autore dei commit: YarjGit con l'email noreply di GitHub, non l'email personale.
- Export articoli reali del gestionale attuale (JSON, 6.724 articoli, 45 campi, senza giacenze): `riferimenti/articoli-export.json` (solo PC di lavoro).
  `strumenti/importa-articoli.ps1` lo converte in `prototipo/js/dati-articoli-reali.js` (escluso da GitHub): se il file c'è, il prototipo locale usa gli articoli veri, online restano quelli di esempio.
  Nell'export fornitore e alcune aliquote sono codici interni (GUID): per collegarli servono gli export di Fornitori e Aliquote. Aliquote riconosciute dai prezzi: `4570c2b4…` = 4%, `9bc97d64…` e `3c5611a4…` = 0% (quale codice a zero: da confermare).
- Fornitori trascritti dagli screenshot (231, senza doppioni): `riferimenti/fornitori/fornitori-da-screenshot.csv` (solo PC di lavoro).
- Articoli → fornitori: export Excel del gestionale attuale in `riferimenti/articoli-fornitori/articoli-fornitori.xlsx` (solo PC di lavoro, colonne Fornitore 1/2 con i nomi).
  `strumenti/collega-fornitori-excel.ps1` genera `riferimenti/import/08-fornitori-da-excel.sql` (da incollare su Supabase; sostituisce 04 e 07).
  Excel: 4.983 articoli; gli altri sono dedotti dal codice (famiglia prima dello slash, poi numero fornitore; senza slash = Magazzino Centrale) e segnati `fornitore_dedotto = true` (da verificare). I 234 rimasti senza sono del Magazzino Centrale (confermato): `database/12-senza-fornitore-a-magazzino-centrale.sql`.
  I prodotti nostri hanno come fornitore "MAGAZZINO CENTRALE" (900009), non "Produzione propria".
- Giacenze di partenza (lette dalla pagina Giacenze del gestionale attuale col Chrome dell'utente, 22/10/2026): `riferimenti/giacenze/` (solo PC di lavoro).
  `strumenti/importa-giacenze.ps1` genera `riferimenti/import/13-giacenze-iniziali.sql`: un movimento "esistenza" per sede e anno di acquisto; le quantità diventano numeriche (decimali per i metri).
- Database **Supabase**: progetto `gestionale-magazzino` (piano gratuito, regione Europa, separato dall'altra web app dell'utente su Vercel).
  URL e chiave publishable in `prototipo/js/supabase-config.js`. Tabelle in `database/01-tabelle.sql` (l'utente le incolla nel SQL Editor).
  Accesso: link via email (`signInWithOtp`). Su Supabase il **Site URL** è `https://yarjgit.github.io/gestionale-magazzino/prototipo/dashboard.html` (i Redirect URLs non sono riusciti a salvarli: il Site URL basta per il sito online). Google da aggiungere.
  Mai chiedere né salvare la chiave secret/service_role o la password del database. Prima dell'uso quotidiano vero: passare a Pro (backup e niente pausa).
