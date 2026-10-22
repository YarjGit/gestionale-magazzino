# Gestionale Magazzino – Documento di progetto

Gestionale web per il controllo del magazzino su 17 sedi in Italia.
Uso interno: la parte fiscale (fatturazione elettronica, corrispettivi) resta al commercialista.

## Obiettivo

Avere sempre sotto controllo le giacenze di ogni sede e i movimenti di merce:
carichi da fornitori, ordini, trasferimenti tra filiali e vendite giornaliere.

## Sedi

Oggi il gestionale attuale è usato solo da **CAL SMM Roma** e **Magazzino Centrale**.
Il nuovo gestionale parte da queste due sedi; le altre (17 in tutto) si aggiungono in seguito.

## Cosa NON fa (gestito dal commercialista)

- Fatturazione elettronica XML / invio allo SDI
- Scontrini e corrispettivi telematici

## Stato del prototipo grafico (cartella `prototipo/`)

Rifatto sulla base degli screenshot del gestionale attuale (in `riferimenti/`), con grafica modificata.
Dati di esempio; i pulsanti di creazione e le azioni mostrano un avviso: la logica si definisce insieme.

- [x] Login (uguale per tutti) e scelta sede all'ingresso
- [x] Dashboard
- [x] Movimenti – 16 voci (entrate, uscite, rettifiche, tutti i movimenti)
- [x] Magazzino – Articoli, Categorie, Sottocategorie, Giacenze
- [x] Configurazione – 18 voci
- [x] Setup – Attività Utenti, Background Task, Sedi, Azioni Applicazione, Firewall Rules, Traduzioni, App Settings
- Rimandati: menu Laboratori e Setup → Utenti Sito (restano nel menu con l'etichetta "in futuro")
- Non rifatto: Controlla Traduzioni (strumento dei programmatori)

Per vederlo: avviare `prototipo/server.ps1` e aprire http://localhost:8080/

## Domande aperte

1. "Record attuali": cosa fa?
2. "Validazione": mostra solo i movimenti provvisori?
3. Pallino a inizio riga in Tutti i Movimenti: apre l'elenco articoli del movimento?
4. ~~Giacenze, colonna anni~~ RISOLTA (vedi STUDIO-GESTIONALE.md): anno di acquisto / quantità iniziale / quantità attuale del lotto, con il costo del lotto
5. Aliquote IVA: significato di "A" e "C" in Applicazione IVA
6. Gruppi (Configurazione): a cosa servono?
7. Macro gruppi di codici e Categorie: sono due classificazioni diverse?
8. Misura delle etichette prodotto e stampante usata
9. App Settings: aliquota IVA predefinita "23" non esiste tra le aliquote
10. Ordini a fornitori, prezzi e aliquote: il costo proposto è circa la metà del prezzo di vendita; il prezzo totale della riga è IVA inclusa (3 × 18,50 al 22% = 67,71). Da decidere insieme come si calcolano costo, ricarico e prezzo di rivendita e quale aliquota usare per riga — CHIARITO (STUDIO-GESTIONALE.md): prezzo = (costo + spese confezione/imballaggio/accessorie) × (1 + ricarico%) × IVA, poi arrotondato; con ricarico 100% il costo è la metà
11. ~~Vendite, Ordinata e Spedita~~ RISOLTA: nel gestionale attuale Ordinata resta vuota e la quantità venduta è in Spedita
12. Prezzo in etichetta: l'arrotondamento è sempre all'euro superiore (53,91 → 54,00) o a volte a 0,50 / 0,10? Nel prototipo il tasto "↑ €" propone l'euro superiore e si può correggere a mano
13. Scheda articolo: nel vecchio gestionale "Costo + IVA" (18,50) non torna con costo 16,65 × 1,22: è un valore vecchio o un altro calcolo?

## Regole decise (22/10/2026)

**Giacenza**
- Gli articoli sono **divisi per anno di acquisto** (lotti): serve per una corretta gestione.
- L'**anno si stampa sull'etichetta del prezzo** di ogni articolo; le etichette si stampano ogni volta che la merce viene caricata in giacenza (anno = anno del carico).
- La giacenza **aumenta** con un **Carico da fornitore** o con un **Trasferimento da filiale**.
- I **trasferimenti tra sedi sono automatici**: la sede che manda fa un Trasferimento a filiale scegliendo la sede che riceve; quando è definitivo la merce entra da sola nella giacenza di chi riceve (niente carico a mano).

**IVA**
- Tutto al **22%**, tranne le **ostie al 4%** e i **libri a 0%** (IVA già pagata dall'editore; codici che iniziano con Q).
  Anche la merce che arriva dai fornitori è sempre al 22% (ostie 4%).
- I 22 articoli non libri che il vecchio gestionale aveva a 0% passano al 22% con `database/09-iva-solo-libri-a-zero.sql` (eseguito il 22/10/2026: libri 49 a 0%, ostie 8 al 4%, 6.667 al 22%)
  (il prezzo in etichetta non cambia). Il "Vangelo medio piatto argento/pelle" (Q11) resta al 22%: con la copertina in argento è un oggetto.
  Da decidere: Q08 Calendario liturgico (oggi 0%) e "Prima comunione – Vestire è servire" (Q11, oggi 22%).
- Le **sedi estere** sono a **0%** (IVA non applicata). Da sapere: quali sono le sedi estere? (nel prototipo l'elenco `SEDI_ESTERE` in `js/sedi.js` è vuoto).

**Da fare nel database (quando si salvano i movimenti)**: segnare l'anno di acquisto su ogni riga di carico e trasferimento, e calcolare la giacenza per sede, articolo e anno.

## Inventario (come si fa oggi in magazzino)

- Si spara ogni pezzo con la pistola uno per uno; con quantità alte si spara un pezzo solo e si scrive la quantità a mano.
- Tutti i pezzi contati vanno sull'**anno in corso** (anno di acquisto).
- Durante l'inventario **non si fanno vendite né scarichi**, per non creare confusione.
- Si fa un paio di volte l'anno.
- Da chiedere alla collega: gli articoli non trovati vanno messi a zero? Chi conferma le differenze prima di aggiornare la giacenza?
- Partenza col nuovo gestionale: copiare le giacenze dal gestionale attuale (serve un export) oppure contare tutto da capo.

## Prossimi passi

1. Rispondere alle domande aperte
2. Scegliere la tecnologia e il server per il programma vero (database centrale, accesso da browser)
3. Costruire la logica: anagrafiche, carico da fornitore con stampa etichette, giacenze per sede, trasferimenti
4. Proforma in PDF su carta intestata
5. Import dei dati dal gestionale attuale (Excel/CSV)

## In futuro

- Collegamento del magazzino all'e-commerce (Setup → Utenti Sito e sincronizzazione giacenze)
- Menu Laboratori (per ora non serve, da rivedere)
