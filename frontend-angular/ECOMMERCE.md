# Collegamento all'e-commerce (Joomla 3 + VirtueMart) — solo il piano, NON attivo

Deciso con l'utente il 26/11/2026: **il collegamento non si fa adesso**; è un'idea dei superiori da valutare in futuro.
Qui ci sono solo le basi, così quel giorno si parte con le idee chiare. Nel gestionale non c'è niente di acceso.

## Cosa c'è già oggi (senza collegamento)
- Le **vendite e-commerce** si registrano a mano: una giornata al giorno (`/vendita/nuovo?canale=ecommerce`, causale "E-COMMERCE – …"),
  ogni vendita una riga con l'ora; la merce esce dalla giacenza della sede che spedisce.
- A fine mese la stampa **"Trasferimento del mese"** per la Sede Centrale Apostolato Liturgico.

## Come si collegherebbe (proposta)
1. **Stesso codice nei due sistemi**: il codice articolo del gestionale = lo SKU del prodotto in VirtueMart
   (`#__virtuemart_products.product_sku`). Prima di tutto si controlla che coincidano (elenco degli SKU senza articolo e viceversa).
2. **Ordini del sito → giornata e-commerce** (la merce esce dalla giacenza):
   - in VirtueMart gli ordini sono in `#__virtuemart_orders` e le righe in `#__virtuemart_order_items` (`order_item_sku`, `product_quantity`);
   - quando un ordine passa a "confermato/spedito", un piccolo plugin Joomla (lato server, PHP) chiama una funzione del database
     del gestionale, ad esempio `registra_vendita_ecommerce(numero_ordine_web, righe)`, che aggiunge le righe alla giornata e-commerce
     di quel giorno **una volta sola** (il numero d'ordine del sito impedisce i doppioni);
   - la chiave per chiamare il database sta **solo nel server Joomla** (configurazione del plugin), mai nelle pagine del sito.
3. **Giacenza → sito** (facoltativo): ogni notte (o a ogni movimento) si aggiorna `product_in_stock` di VirtueMart con la giacenza
   della sede che spedisce, così il sito non vende quello che non c'è.
4. In alternativa al plugin: una **Edge Function** di Supabase che legge gli ordini nuovi dal sito a intervalli regolari.

## Da decidere insieme, quel giorno
- Quale sede spedisce gli ordini online (oggi: quella in cui si registra la giornata e-commerce).
- Se gli ordini annullati sul sito devono tornare in giacenza da soli.
- Se la giacenza va mandata al sito e ogni quanto.
- Accesso tecnico al server Joomla (versione PHP, possibilità di installare un plugin).

Nota: Joomla 3 non riceve più aggiornamenti di sicurezza dal 2023: prima di collegarlo al gestionale conviene valutarne l'aggiornamento.
