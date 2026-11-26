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
- Rimandati al futuro: collegamento all'e-commerce e menu Laboratori. Restano nel menu con l'etichetta "in futuro".

## Come lavoriamo
- L'utente manda uno screenshot per ogni schermata del gestionale attuale; si rifà la schermata **simile ma mai identica**: cambiare sempre qualcosa nella grafica e dire cosa è cambiato.
- Prima la grafica (prototipo), la logica si decide insieme dopo. I pulsanti che salvano o stampano mostrano un avviso.
- **Prezzi sempre con due decimali**: arrotondare prezzi unitari e totali al centesimo (anche quelli scritti a mano).
- **Prezzo di vendita finale (etichetta) ai 10 centesimi**: fino a 10,04 → 10,00, da 10,05 → 10,10 (anche scritto a mano e sulle etichette: mai 10,03).
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
- Righe articolo comuni a tutte le schede (＋, cestino, frecce, − / +, IVA per riga, pistola): `js/righe-movimento.js`. Niente riquadro "Aggiungi articolo" (tolto il 24/11/2026):
  si aggiunge col ＋ scrivendo o sparando il codice; dopo ogni articolo si apre da sola una riga nuova; le righe vuote si tolgono al salvataggio.
  Schede: `carico.html`, `ordine.html` (fornitore obbligatorio, articoli del fornitore), `vendita.html` (quantità solo in Spedita, prezzi IVA inclusa).
- **Vendite e-commerce** = `vendita.html?nuovo=1&canale=ecommerce` (tasto "🛒 Vendite e-commerce" in Vendite Giornaliere): una giornata al giorno, causale "E-COMMERCE – …".
  Nel vecchio era un trasferimento mensile alla Sede Centrale riempito per tutto il mese (date sbagliate, giacenza sotto zero). Regole di ogni giornata (negozio o e-commerce):
  se quella del giorno c'è già: finestra "già create, vuoi riaprire quelle di oggi?" (Sì = si riapre; No = un'altra giornata con nota obbligatoria,
  scritta nella causale e nelle annotazioni); su una giornata vecchia si chiede prima di aggiungere articoli, spostarla di giorno chiede conferma e mai in un altro anno.
  Trasferimenti: non si manda più della giacenza (blocco, non più solo conferma).
  Lista a parte `vendite-giornaliere.html?canale=ecommerce` (la lista normale mostra solo il negozio); "Aggiungi alle vendite di oggi" apre `vendita.html?db=N&modifica=1`.
  Nella giornata e-commerce ogni vendita è una riga a sé con l'ora (`righeSeparate`, colonna `movimenti_righe.aggiunto_il`, `database/26-ora-righe.sql`).
  Scarica dalla sede di lavoro. "🖨️ Trasferimento del mese": stampa su carta intestata (`stampa-documento.html`) "Trasferimento a Filiale" alla Sede Centrale Apostolato Liturgico
  (Via Portuense 739), identica a quella dell'ordine a fornitore (noi a sinistra, destinatario a destra; Pr. Unit. = costo d'acquisto, Sconto %, IVA, importo IVA inclusa ai 5 centesimi, niente note), una riga per articolo con i pezzi del mese, numero mese/anno, data = fine mese. L'Excel del mese è stato tolto (24/11/2026: non serve).
  In cima alla lista i tasti uniti "🏪 Vendite del centro / 🛒 Vendite e-commerce" (`.scelta-canale`), sempre nello stesso posto: quello della lista aperta è blu.
- **Cambio sede con una pagina aperta**: la pagina si ricarica con la sede nuova (prima un movimento aperto restava sulla sede vecchia); se si sta modificando, chiede conferma.
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
- `ordine-cliente.html` (elenco `ordini-clienti.html`, `database/21-ordini-clienti-ddt.sql`): ordine da cliente con **solo il cliente** (nel vecchio c'era anche
  "Fornitore" e il DDT usciva intestato a quello). Cliente cercato scrivendo o aggiunto al volo; prezzi di vendita IVA inclusa; numero bolla automatico "N/anno".
  Stampa **DDT** `stampa-ddt.html` identica a quella del gestionale attuale (richiesta dell'utente): "DA CONSEGNARE A" = sempre il cliente. L'ordine non scarica la giacenza:
  prima del DDT la finestra "Vuoi scalare la merce dalla giacenza?" (Sì = movimento `scarico_cliente` con le righe collegate via `ordine_riga_id`, una volta sola;
  No = niente). Da quale anno di acquisto scalare: da decidere con l'utente. Dopo il Sì l'ordine diventa Evaso e i suoi articoli non si cambiano più (si salvano solo i dati del documento).
- **Scarico a cliente** = stessa scheda `ordine-cliente.html` (`?nuovo=1&tipo=scarico`, o un `scarico_cliente` salvato): toglie la merce appena è Definitivo,
  non lascia mandare più della giacenza, DDT intitolato "Spedizione a Cliente". Lo scarico nato da un ordine tiene `ordine_riga_id` anche se si modifica (meno pezzi = spedizione parziale).
  Numero bolla unico per ordini e scarichi della sede. "Sconto cliente %" (es. librerie 35%) mette lo sconto su tutte le righe e su quelle aggiunte dopo.
  In Ordini da Clienti del Magazzino Centrale il riquadro "Ordini ricevuti dalle filiali" (→ trasferimento / inevasi), separato dagli ordini dei clienti.
- `aumento.html` (elenco `aumento-giacenza.html`): merce che entra senza fornitore. Motivo a riquadri (Inventario, Da altri centri o sedi chiuse,
  Donazione, Altro), **anno di acquisto scelto a mano** (anche passato: si stampa sulle etichette), prezzi di acquisto, quantità in "Arrivata".
  Colonne `motivo` e `anno_acquisto` in `database/16-aumento-giacenza.sql`.
- Tasto **Excel** in carico, ordine, trasferimento, vendita e aumento (`js/excel.js`, senza librerie): vero .xlsx come quello del gestionale attuale,
  fogli "Riepilogo" (Ente, tipo, numero, date, fornitore o sedi, totali e spese) e "Dettaglio" (Codice … Prezzo Totale); nome "ENTE_Tipo_N_#id.xlsx".
- **Utenti Sito** (`utenti-sito.html`, `database/25-utenti-sito.sql`) = chi può entrare nel gestionale (non l'e-commerce): mail, nome, ruoli
  (amministratore, responsabile magazzino, operatore, traduttore, diagnostica), sedi (solo informative), bloccato. Si entra col link alla mail.
  Solo gli amministratori (`e_amministratore()`) modificano; nessuno può togliersi da solo il ruolo di amministratore. I ruoli per ora sono etichette:
  i permessi per ruolo si decideranno insieme. "Impersona" del gestionale attuale non c'è (serve la chiave segreta del database).
- **Attività Utenti** (`attivita-utenti.html`, `database/24-registro-attivita.sql`): tabella `registro_attivita` (solo lettura e aggiunta).
  Le modifiche a movimenti, articoli, fornitori, clienti, fornitori delle sedi e utenti le annota il database (trigger `registra`, mail dal login);
  accessi (una volta per login), uscite, scelta sede, stampa etichette, DDT ed Excel con `registra(attivita, dettagli)` di `layout.js`.
- **Regole nel database** (`database/27-funzioni-movimenti.sql`, 25/11/2026): `salva_movimento(id, movimento, righe)` salva tutto o niente, blocca la giacenza
  sotto zero (o più sotto di prima) nella sede del movimento e dà il numero di bolla "N/anno" con un lucchetto (niente doppioni); `scala_ordine_cliente(ordine)`
  crea lo scarico una volta sola e mette l'ordine in Evaso. `salvaMovimentoDb` le usa e, se non ci sono ancora, salva come prima.
  Edge Functions di Supabase: solo quando servono (collegamento e-commerce, email), per ora nessuna.
- **Lavoro da più computer insieme** (`database/28-lavoro-in-contemporanea.sql`, 25/11/2026): `salva_movimento` mette lucchetti per sede+articolo e per riga d'ordine
  (ultimo pezzo non venduto due volte, ordine di una filiale non preparato due volte: `ORDINE_GIA_PREPARATO`, salvo `_oltre_ok`), controlla la versione della scheda
  (`_versione` = `modificato_il` letto, in `VERSIONI_MOV` di `movimenti-db.js`; se un altro ha salvato prima: `CONFLITTO`, niente sovrascrittura) e tiene una sola giornata
  di vendite per giorno (`GIORNATA_ESISTE|id`, salvo nota " – "). In `vendita.html` `unisciAllaGiornata` aggiunge da solo i propri articoli alla giornata dell'altro
  (i colleghi vendono articoli diversi, quindi non si scontrano). Colonna `modificato_da`.
- `diminuzione.html` (come `aumento.html`): merce che esce senza vendita né trasferimento (rotta, mancante all'inventario, smarrita, uso interno, altro);
  niente anno (esce dal lotto più vecchio), niente etichette, non più pezzi di quelli in giacenza.
- **Inventario** `riallineamento.html` (`database/31-inventario.sql`, tipo "riallineamento"): tutto il magazzino o solo una parte; si sparano i pezzi
  (in corso = Provvisorio, quantita 0 e quantita_contata); non sparati (solo "tutto"): Lascia / Modifica / Elimina (giacenza a zero e articolo
  disattivato se le altre sedi non ne hanno); alla conferma per ogni articolo una riga −giacenza e una +contati sull'anno in corso.
  Confermano solo amministratore e responsabile magazzino. Inventario in corso: avviso rosso in vendite, scarichi, diminuzioni, trasferimenti.
  Gli articoli disattivati non compaiono nella ricerca né con la pistola.
- Scheda articolo `articolo.html?cod=…` con calcolo del prezzo: (costo netto + spese) × (1 + ricarico) + IVA + arrotondamento.
  Schede Giacenza / Giacenza altre sedi / Movimenti calcolate dai movimenti veri (`caricaGiacenzaVera`): lotti per anno di acquisto,
  le uscite tolgono dal lotto più vecchio; In arrivo (ordini definitivi non caricati + inevasi), Prenotati (ordini clienti), Disponibile previsto.
  Barcode: serve solo per le nostre etichette (i barcode dei produttori non si usano): non si scrive a mano, al salvataggio di un articolo
  senza barcode si crea un EAN-13 nuovo e univoco della serie interna 200 + progressivo (da cambiare se 8030969 risultasse il codice azienda GS1).
  Scheda Materiali: righe scritte a mano (materiale, fornitore, quantità, info, costo) salvate in `articoli.materiali` (`database/30-materiali-articoli.sql`).

## Idee in prova (si possono togliere)
- **Etichetta per la scatola** (commit fe553fc): nella pagina etichette casella "🏷️ Doppia etichetta" per riga → per ogni pezzo anche una
  seconda etichetta (per la scatola) con il codice nel riquadro nero (per ora solo per CAL SMM Roma: DOPPIA_ETICHETTA in etichette.html); tolto "Barcode duplicati". Se l'idea non piace: `git revert fe553fc`
  (lo stato di prima è segnato con il tag `prima-etichette-scatola`).

## Struttura
- `prototipo/` – il prototipo HTML/CSS/JS, senza build. Si apre con `Avvia prototipo.bat` (server PowerShell su http://localhost:8080).
  - `js/layout.js` menu laterale, barra in alto, scelta sede; `js/elenco.js` modello comune delle pagine elenco movimenti; `js/anagrafica.js` modello delle tabelle di Configurazione/Setup.
  - `js/dati-*.js` dati di esempio (anagrafiche finché non arriva il database). **Niente movimenti di esempio** negli elenchi e in Dashboard (chiesto dall’utente il 06/11/2026): solo quelli veri del database.
  - `carico.html` scheda carico (nuovo `?nuovo=1`, salvato `?db=N`); `etichette.html` stampa etichette. Tutti i tasti Excel scaricano .xlsx (`js/excel.js`, `esportaExcel` in `layout.js`), mai CSV.
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
- **Ogni sede del gestionale attuale ha il suo elenco di fornitori e di articoli.** Magazzino Centrale (24/11/2026, solo PC di lavoro):
  53 fornitori → `riferimenti/import/23-fornitori-magazzino-centrale.sql` (27 mancanti); 4.836 articoli (Articoli → Import/Export → "Esporta JSON")
  in `riferimenti/magazzino-centrale/`, `strumenti/importa-articoli-mc.ps1` (non su GitHub: contiene nomi di fornitori) → `24-articoli-magazzino-centrale.sql` (2.603 articoli).
  **Codici quasi uguali** (stessi caratteri a parte spazi, slash, punti: "F06P1 AV" / "F06 P1 AV") a volte sono lo stesso articolo, a volte articoli diversi
  ("Q1103" / "Q11/03"): si uniscono solo se coincide anche l'inizio della descrizione. **Barcode uguali per articoli diversi** tra le sedi: l'articolo
  del Magazzino Centrale entra senza barcode. Elenco: `riferimenti/magazzino-centrale/codici-da-controllare.csv`.
  Nel nuovo: la scheda articolo avvisa per codici quasi uguali e barcode già usati e toglie gli spazi doppi dai codici nuovi;
  se la pistola legge un barcode presente su più articoli si sceglie dalla lista.
- **Fornitori per sede** (chiesto dall'utente il 24/11/2026, come nel gestionale attuale): anagrafica unica + tabella `fornitori_sedi`
  (`database/23-fornitori-per-sede.sql`; elenchi veri SMM 231 / Magazzino Centrale 51 / Roma per Estero 111 in `riferimenti/import/25-fornitori-per-sede.sql`).
  `soloFornitoriSede` / `idFornitoriSedeDb` in `layout.js`: carico, ordine e scheda articolo mostrano solo i fornitori della sede (più quello già scelto);
  l'elenco Fornitori ha il tasto "Anche delle altre sedi" e la colonna "Usato da". Senza la tabella o senza collegamenti si vedono tutti.
- Scheda fornitore `fornitore.html`: caselle "Sedi che usano questo fornitore" (il nuovo è della sede che lo crea); se esiste già in un'altra sede, "Usalo anche a …" invece del doppione.
  Scheda fornitore `fornitore.html` (`?nuovo=1`, `?cod=…`; colonne in `database/22-scheda-fornitori.sql`): codice automatico (il successivo sotto 003500),
  avviso se nome o partita IVA ci sono già (la P.IVA delle Pie Discepole è comune a tutte le sedi), schede Articoli e Storico.
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
- **Backup del database** (piano gratuito, deciso il 24/11/2026): `Backup gestionale - imposta.bat` (una volta per PC: l'utente incolla l'indirizzo
  "Session pooler" con la password, salvato cifrato da Windows in `%LOCALAPPDATA%\GestionaleMagazzino`) e attiva il backup giornaliero alle 13:00
  (Utilità di pianificazione, "Backup gestionale magazzino"); `Backup gestionale - adesso.bat` per farlo subito. Script in `strumenti/backup-database.ps1`
  (pg_dump di PostgreSQL 17 Command Line Tools), copie in `Documenti\Backup gestionale` (60 giorni, almeno 10), registro `backup.log`.

## Nuova versione in Angular (`frontend-angular/`)
- Gestionale rifatto in Angular (21, standalone, Signals, TypeScript strict) + `@supabase/supabase-js`, nella sottocartella
  `frontend-angular/`. Il prototipo `prototipo/` **resta com'è e funziona**: è il riferimento funzionale, non va modificato.
- **Tutte le 16 voci migrate** (26/11/2026): dashboard, articoli, giacenze, anagrafiche, elenchi e schede di tutti i movimenti
  (carico, ordine, vendita negozio ed e-commerce, trasferimento con inevasi, aumento/diminuzione, ordine cliente/scarico con DDT,
  inventario), pagina Inevasi, stampe (carta intestata, DDT, etichette), Setup (utenti, attività). Dettagli: `frontend-angular/MIGRAZIONE.md`.
- Regole architetturali obbligatorie: `frontend-angular/CLAUDE.md` (scritture solo tramite RPC/transazioni PostgreSQL, mai calcoli di
  giacenza solo lato client, paginazione e ricerca lato server, tipi allineati allo schema, `core/` `features/` `shared/`).
- Database per la nuova versione: `33-funzioni-sicure.sql` e `34-funzioni-angular.sql` (eseguiti il 26/11/2026; il 34 si riesegue
  quando cambia), `35-indici-e-controlli.sql` (eseguito il 26/11/2026), `36-permessi-per-sede.sql` (dopo aver spuntato la sede di ogni
  persona in Utenti Sito), `37-solo-funzioni.sql` (**solo** quando il prototipo non si usa più).
- Provarla: `Avvia versione Angular.bat` (serve Node.js); dati inventati con `http://localhost:4200/?anteprima=1`, veri con `?anteprima=0`.
- Pubblicazione **preparata ma non attiva** (Cloudflare Pages o GitHub Pages: `frontend-angular/README.md`): la decide l'utente.
- E-commerce (Joomla 3 + VirtueMart): solo il piano in `frontend-angular/ECOMMERCE.md`, da non realizzare finché l'utente non lo chiede.
