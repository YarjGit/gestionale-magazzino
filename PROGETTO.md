# Gestionale Magazzino – Documento di progetto

Gestionale web per il controllo del magazzino su 17 sedi in Italia.
Uso interno: la parte fiscale (fatturazione elettronica, corrispettivi) resta al commercialista.

## Obiettivo

Avere sempre sotto controllo le giacenze di ogni sede e i movimenti di merce:
carichi da fornitori, ordini, trasferimenti tra filiali e vendite giornaliere.

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
4. Giacenze, colonna anni (es. "2025 / 2 / 0"): cosa sono i due numeri?
5. Aliquote IVA: significato di "A" e "C" in Applicazione IVA
6. Gruppi (Configurazione): a cosa servono?
7. Macro gruppi di codici e Categorie: sono due classificazioni diverse?
8. Misura delle etichette prodotto e stampante usata
9. App Settings: aliquota IVA predefinita "23" non esiste tra le aliquote

## Prossimi passi

1. Rispondere alle domande aperte
2. Scegliere la tecnologia e il server per il programma vero (database centrale, accesso da browser)
3. Costruire la logica: anagrafiche, carico da fornitore con stampa etichette, giacenze per sede, trasferimenti
4. Proforma in PDF su carta intestata
5. Import dei dati dal gestionale attuale (Excel/CSV)

## In futuro

- Collegamento del magazzino all'e-commerce (Setup → Utenti Sito e sincronizzazione giacenze)
- Menu Laboratori (per ora non serve, da rivedere)
