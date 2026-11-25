# Gestionale Magazzino – frontend Angular

Nuova versione del gestionale in Angular (cartella `frontend-angular/`). Il prototipo in JavaScript puro (`../prototipo/`)
**resta com'è e continua a funzionare**: è il riferimento funzionale (cosa fa ogni schermata, quali query e RPC usa).
Non modificarlo e non cancellarlo durante la migrazione. Database e regole di business: `../database/*.sql`, `../CLAUDE.md`.

## Regole architetturali

1. **Nessuna logica critica di giacenza o movimentazione solo lato client.**
   Tutti i dati si scrivono **solo tramite funzioni RPC / transazioni PostgreSQL su Supabase**: carichi, scarichi, vendite
   giornaliere ed e-commerce, trasferimenti (invio, ricezione, annullamento), aumenti e diminuzioni giacenza, inventario
   (riallineamento: anche il calcolo delle differenze), ordini e inevasi, articoli, fornitori, clienti, sedi, utenti, file.
   - Mai `.insert()` / `.update()` / `.delete()` diretti dal frontend sulle tabelle. Se manca la funzione SQL, prima la si scrive
     in `../database/NN-....sql` (transazione, controlli di permesso, `security definer` o `invoker` motivato), poi la si usa.
   - La giacenza è sempre quella della vista `giacenze` (o di una funzione del database), mai ricalcolata in pagina per decidere.
   - Il frontend può calcolare solo anteprime da mostrare (totali di una scheda, prezzo proposto); il valore che conta
     lo ricalcola e lo controlla il database.
2. **Paginazione e ricerca lato server ovunque.** Gli articoli sono migliaia: nessuna lista carica l'intero catalogo.
   Si usano `.range()` + `count: 'exact'`, filtri e ricerca (`ilike` / full-text) nella query, o RPC che restituiscono una pagina.
   La pistola barcode cerca con una query mirata (`barcode` o `codice` esatti), non in un elenco in memoria.
3. **TypeScript rigoroso.** `strict` attivo, niente `any`. I tipi del database stanno in `src/app/core/models/database.types.ts`
   (allineati agli script SQL); le colonne `numeric` si convertono con `toNumber()`. Ogni RPC è tipizzata in `RpcFunzioni`.
4. **Architettura pulita.**
   - `src/app/core/` – servizi unici dell'app: `SupabaseService` (client, RPC tipizzate, paginazione), `AuthService`
     (sessione, autorizzazione), `SedeService` (sede di lavoro), guard, modelli.
   - `src/app/features/` – una cartella per area: `articoli/`, `giacenze/`, `movimenti/`, `trasferimenti/`, `sedi/` …
     (componenti di pagina + servizio dati della feature).
   - `src/app/shared/` – componenti riutilizzabili (tabella paginata, campo pistola/ricerca articolo, conferme, stati di caricamento).
5. **Angular moderno.** Componenti standalone, Signals (`signal`, `computed`, `input()`, `output()`), `inject()`,
   control flow `@if/@for`, guard e interceptor funzionali, change detection OnPush.
6. **Stati chiari.** Ogni schermata gestisce caricamento, vuoto ed errore; gli errori del database (`CONFLITTO`,
   `GIORNATA_ESISTE`, `ORDINE_GIA_PREPARATO`, `Giacenza insufficiente`) si mostrano in italiano semplice.
7. **Regole di business da rispettare** (vedi `../CLAUDE.md`): prezzi a due decimali, prezzo in etichetta ai 10 centesimi,
   IVA 22% / 4% ostie / 0% libri e sedi estere, giacenza per anno di acquisto (uscite dal lotto più vecchio), barcode creato dal
   gestionale (serie 200), ogni sede lavora separata nella sua scheda del browser, l'utente parla italiano e non è un programmatore.

## Comandi
- `npm start` (sviluppo, http://localhost:4200) · `npx ng build` (deve compilare senza errori prima di ogni consegna).
- Angular 21 (Angular 22 richiede Node ≥ 24.15; sul PC c'è 24.12).

## Migrazione
Una schermata alla volta, nell'ordine della checklist in `MIGRAZIONE.md`; per ognuna: stessa logica e stesse query/RPC
del prototipo, paginazione lato server, tipi completi, stati di caricamento ed errore, `ng build` senza errori.
