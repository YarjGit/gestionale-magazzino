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
- La nuova versione usa le funzioni di `database/33-funzioni-sicure.sql` e `database/34-funzioni-angular.sql` (già eseguiti su
  Supabase il 26/11/2026; il 34 va rieseguito quando cambia). Non cambiano niente per il prototipo: aggiungono solo funzioni.

## Comandi (per chi sviluppa)

- `npm start` – server di sviluppo su http://localhost:4200
- `npx ng build` – compila la versione da pubblicare in `dist/frontend-angular/browser` (deve finire senza errori)

## Pubblicazione (preparata, NON attiva: la scelta è dell'utente)

La versione da pubblicare si crea con `npm run build:cloudflare` (o `npm run build:github`) nella cartella
`dist/frontend-angular/browser/`. Contiene solo la chiave *publishable* di Supabase (pubblica per natura): nessuna chiave segreta.

**Cloudflare Pages** (consigliato: pagine veloci, indirizzi puliti, protezioni già pronte)
1. Su Cloudflare: Workers & Pages → Create → Pages → collega il repository GitHub `gestionale-magazzino`.
2. Impostazioni di build: *Root directory* `frontend-angular`, *Build command* `npm run build:cloudflare`,
   *Build output directory* `dist/frontend-angular/browser`, variabile `NODE_VERSION` = `22`.
3. Su Supabase → Authentication → URL Configuration: aggiungere l'indirizzo dato da Cloudflare (es. `https://gestionale-magazzino.pages.dev/**`)
   ai Redirect URLs (per il link di accesso via email).
   I file `public/_redirects` (tutte le pagine aprono l'app) e `public/_headers` (protezioni del browser) sono già pronti.

**GitHub Pages** (in alternativa, accanto al prototipo)
- `npm run build:github` crea la versione per l'indirizzo `https://yarjgit.github.io/gestionale-magazzino/nuova/` (con `404.html`
  per aprire direttamente le pagine interne). Il contenuto di `dist/frontend-angular/browser/` andrebbe copiato nella cartella
  `nuova/` della radice del repository. Anche qui l'indirizzo va aggiunto ai Redirect URLs di Supabase.

Prima di pubblicare per l'uso vero: su Supabase il `35` è già eseguito (26/11/2026); poi `36` (dopo aver spuntato le sedi di ogni persona)
e, quando il prototipo non si usa più, `37` (vedi `MIGRAZIONE.md`, punti 5 e 7).

## Struttura
- `src/app/core/` – Supabase (client, RPC tipizzate, pagine dal database), accesso, sede di lavoro, guard, layout (menu e barra),
  tipi del database (`models/database.types.ts`), modalità anteprima con dati finti (solo sviluppo).
- `src/app/features/` – una cartella per area: `articoli/`, `giacenze/`, `anagrafiche/`, `dashboard/`, `movimenti/` (elenchi e schede:
  carico, ordine, vendita, trasferimento, aumento/diminuzione, ordine cliente/scarico, inventario), `trasferimenti/` (inevasi),
  `stampe/` (carta intestata, DDT, etichette), `setup/` (utenti, attività).
- `src/app/shared/` – pezzi comuni: righe articolo con la pistola (`righe-movimento`), elenco movimenti e anagrafiche a pagine,
  intestazione delle schede, ricerca fornitore/cliente, barcode, prezzi, Excel (.xlsx), carta intestata, formati italiani.
