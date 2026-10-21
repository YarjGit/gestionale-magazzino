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
- Misure come il gestionale reale: righe tabella ~41 px, voci menu ~38 px, titolo 18 px (non "zoomato").
- Domande aperte e prossimi passi: `PROGETTO.md`.

## Struttura
- `prototipo/` – il prototipo HTML/CSS/JS, senza build. Si apre con `Avvia prototipo.bat` (server PowerShell su http://localhost:8080).
  - `js/layout.js` menu laterale, barra in alto, scelta sede; `js/elenco.js` modello comune delle pagine elenco movimenti; `js/anagrafica.js` modello delle tabelle di Configurazione/Setup.
  - `js/dati-*.js` dati di esempio; `carico.html` scheda carico (vedi `?id=8815`, nuovo `?nuovo=1`); `etichette.html` stampa etichette.
- `riferimenti/` – screenshot del gestionale attuale: contengono dati reali, **non pubblicarli** (esclusi da `.gitignore`, esistono solo sul PC di lavoro).
- Online (GitHub Pages, pubblico, dalla radice del ramo `main`): https://yarjgit.github.io/gestionale-magazzino/ → `index.html` rimanda a `prototipo/login.html`.

## Due PC (lavoro e casa) con GitHub
L'utente lavora da due PC e usa GitHub solo dal sito: Git lo usa Claude.
- **All'inizio di ogni sessione:** `git pull` per avere l'ultima versione.
- **A fine lavoro (o quando l'utente lo chiede):** commit con messaggio in italiano e `git push` su `origin main`. Il sito si aggiorna da solo in 1–2 minuti.
- Il repository è **pubblico**: prima di ogni commit controllare che non entrino dati reali (screenshot, export JSON, email, IBAN, matricole).
- Autore dei commit: YarjGit con l'email noreply di GitHub, non l'email personale.
- Export articoli reali del gestionale attuale (JSON, 6.724 articoli, 45 campi, senza giacenze): `riferimenti/articoli-export.json` (solo PC di lavoro).
  `strumenti/importa-articoli.ps1` lo converte in `prototipo/js/dati-articoli-reali.js` (escluso da GitHub): se il file c'è, il prototipo locale usa gli articoli veri, online restano quelli di esempio.
  Nell'export fornitore e alcune aliquote sono codici interni (GUID): per collegarli servono gli export di Fornitori e Aliquote. Aliquote riconosciute dai prezzi: `4570c2b4…` = 4%, `9bc97d64…` e `3c5611a4…` = 0% (quale codice a zero: da confermare).
- Fornitori trascritti dagli screenshot (231, senza doppioni): `riferimenti/fornitori/fornitori-da-screenshot.csv` (solo PC di lavoro).
- Database **Supabase**: progetto `gestionale-magazzino` (piano gratuito, regione Europa, separato dall'altra web app dell'utente su Vercel).
  URL e chiave publishable in `prototipo/js/supabase-config.js`. Tabelle in `database/01-tabelle.sql` (l'utente le incolla nel SQL Editor).
  Mai chiedere né salvare la chiave secret/service_role o la password del database. Prima dell'uso quotidiano vero: passare a Pro (backup e niente pausa).
