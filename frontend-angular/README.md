# Gestionale Magazzino – nuova versione (Angular)

Rifacimento del gestionale in Angular 21 + Supabase. **Il prototipo in `../prototipo/` resta com'è e continua a funzionare**:
questa cartella è separata e non lo tocca. Regole per chi sviluppa: `CLAUDE.md`; avanzamento e checklist: `MIGRAZIONE.md`.

## Provarla su un PC (casa o lavoro)

1. Aggiornare la cartella da GitHub (`git pull`, o "aggiorna da GitHub" a Claude).
2. Serve **Node.js** (versione LTS, da https://nodejs.org) una volta sola per PC.
3. Doppio clic su **`Avvia versione Angular.bat`** (nella cartella principale, accanto a "Avvia prototipo.bat").
   La prima volta scarica i pacchetti (qualche minuto), poi apre http://localhost:4200/ nel browser.
   Se dopo un aggiornamento da GitHub l'elenco dei pacchetti è cambiato, li riscarica da solo.

- **Dati inventati** (per guardare le schermate senza accedere): http://localhost:4200/?anteprima=1 — per tornare ai dati veri: `?anteprima=0`.
  L'anteprima esiste solo così, in locale: nella versione pubblicata non c'è.
- **Dati veri**: si entra con la stessa mail del prototipo. Il link via email riporta a `localhost:4200` solo se su Supabase
  (Authentication → URL Configuration → Redirect URLs) c'è `http://localhost:4200/**`.
- Le funzioni che **salvano** (articoli, fornitori, clienti) usano `database/33-funzioni-sicure.sql`: va incollato una volta
  nel SQL Editor di Supabase (non cambia niente per il prototipo, aggiunge solo funzioni).

## Comandi (per chi sviluppa)

- `npm start` – server di sviluppo su http://localhost:4200
- `npx ng build` – compila la versione da pubblicare in `dist/frontend-angular/browser` (deve finire senza errori)

## Pubblicazione

Non ancora attiva: la scelta (Cloudflare Pages o altro) è dell'utente. Il frontend contiene solo la chiave *publishable*
di Supabase (pubblica per natura); la chiave segreta e la password del database non vanno mai nel codice.
