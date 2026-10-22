# Gestionale Magazzino

Gestionale di magazzino per le sedi CAL: carichi, ordini, trasferimenti tra filiali, vendite giornaliere, giacenze ed etichette con barcode.

**Prototipo online:** https://yarjgit.github.io/gestionale-magazzino/

Per ora è un prototipo grafico con dati di esempio: i pulsanti che salvano o stampano mostrano solo un avviso.

- `prototipo/` – le pagine del gestionale
- `PROGETTO.md` – stato del lavoro, domande aperte e prossimi passi
- `STUDIO-GESTIONALE.md` – come funziona il gestionale attuale (schede, campi, giacenze, calcolo dei prezzi)
- `CLAUDE.md` – riassunto del progetto per Claude
- `Avvia prototipo.bat` – apre il prototipo sul proprio PC (http://localhost:8080)

## Lavorare da un altro PC (es. casa)

Per **provare** il gestionale basta il link qui sopra: funziona da qualsiasi PC, con gli stessi dati del database.

Per **continuare a costruirlo con Claude**:
1. Apri l'app Claude, scheda **Code**, e scegli la cartella `Gestionale Magazzino` di quel PC
   (la prima volta: chiedi a Claude di scaricarla da GitHub, `https://github.com/YarjGit/gestionale-magazzino`).
2. Come primo messaggio scrivi: **"aggiorna da GitHub"**. Claude scarica l'ultima versione fatta sull'altro PC.
3. A fine lavoro scrivi: **"salva su GitHub"**. Così sull'altro PC ritrovi tutto.

Restano solo sul PC di lavoro (dati reali, non vanno su GitHub): la cartella `riferimenti/` (screenshot, export, Excel)
e `prototipo/js/dati-articoli-reali.js`. Da casa il prototipo usa comunque gli articoli veri del database online.
