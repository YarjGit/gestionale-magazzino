# Gestionale Magazzino

Rifacimento del gestionale di magazzino dell'utente (17 sedi in Italia, negozi "CAL" + laboratori e magazzino centrale).
L'utente parla italiano e non è un programmatore: rispondere in italiano, semplice, senza gergo.

## Cosa fa e cosa no
- Serve solo a tenere sotto controllo il magazzino: carichi, ordini, trasferimenti tra filiali, vendite giornaliere come scarico, giacenze, etichette.
- Fatturazione elettronica (SDI) e scontrini/corrispettivi restano al commercialista: niente XML, niente registratore telematico. I documenti sono proforma/PDF interni su carta intestata.
- Login uguale per tutti (Google); la sede di lavoro si sceglie dopo l'accesso e si cambia dal tasto colorato in alto.
- Nelle sedi si usa una **pistola laser barcode** (si comporta come una tastiera: scrive il codice e preme Invio) per etichette, vendite e inventario. I barcode stampati devono essere veri: EAN-13 se la cifra di controllo è giusta, altrimenti Code 128 (vedi `prototipo/js/barcode.js`). Ogni campo "aggiungi articolo" deve accettare la pistola.
- Rimandati al futuro: collegamento all'e-commerce (Setup → Utenti Sito) e menu Laboratori. Restano nel menu con l'etichetta "in futuro".

## Come lavoriamo
- L'utente manda uno screenshot per ogni schermata del gestionale attuale; si rifà la schermata **simile ma mai identica**: cambiare sempre qualcosa nella grafica e dire cosa è cambiato.
- Prima la grafica (prototipo), la logica si decide insieme dopo. I pulsanti che salvano o stampano mostrano un avviso.
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
- Export articoli reali del gestionale attuale (JSON, 6.724 articoli, 45 campi, senza giacenze): per ora in Download sul PC di lavoro; servirà per l'import.
