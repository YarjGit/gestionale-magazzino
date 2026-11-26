/**
 * Modelli del database Supabase del gestionale, ricavati dagli script in `database/` (01-tabelle … 31-inventario)
 * e dalle query del prototipo in JavaScript puro (`prototipo/`).
 *
 * Note sui tipi:
 * - le colonne `numeric` arrivano da PostgREST come numero o come stringa: usare sempre `toNumber()` prima dei calcoli;
 * - le date (`date`) sono stringhe 'AAAA-MM-GG', i `timestamptz` stringhe ISO.
 * Se lo schema cambia, aggiornare qui (in futuro si possono generare con `supabase gen types typescript`).
 */

export type Numerico = number | string;
export const toNumber = (v: Numerico | null | undefined): number => (v == null ? 0 : typeof v === 'number' ? v : Number(v) || 0);

// ---------- Codici fissi ----------

/** Id delle sedi nel database (tabella `sedi`). Oggi lavorano CAL SMM Roma e Magazzino Centrale. */
export type SedeId = 'cal-smm-roma' | 'magazzino-centrale' | 'cal-roma-estero' | (string & {});

/** Tipi di movimento (tabella `tipi_movimento`): il segno decide come cambia la giacenza della sede. */
export type TipoMovimentoCodice =
  | 'carico_fornitore'        // +1
  | 'ordine_fornitore'        //  0
  | 'trasferimento_da_filiale'// +1 (non usato: l'arrivo è il trasferimento_a_filiale ricevuto)
  | 'reso_da_cliente'         // +1
  | 'aumento_giacenza'        // +1
  | 'altro_carico'            // +1
  | 'vendite_giornaliere'     // -1 (negozio ed e-commerce)
  | 'scarico_cliente'         // -1
  | 'ordine_cliente'          //  0
  | 'reso_a_fornitore'        // -1
  | 'trasferimento_a_filiale' // -1 per chi manda, +1 per chi riceve dopo "Conferma ricevuto"
  | 'preventivo'              //  0
  | 'diminuzione_giacenza'    // -1
  | 'altro_scarico'           // -1
  | 'esistenza'               // +1 (giacenza iniziale importata)
  | 'riallineamento';         // +1 con quantità con segno (inventario)

export type StatoMovimento = 'Provvisorio' | 'Definitivo' | 'Riordino' | 'Evaso' | 'Annullato';

/** Ruoli in `utenti_autorizzati.ruoli` (database/25-utenti-sito.sql). */
export type Ruolo = 'amministratore' | 'responsabile_magazzino' | 'operatore' | 'traduttore' | 'diagnostica';

// ---------- Tabelle ----------

export interface Sede {
  id: SedeId;
  nome: string;
  gruppo: string;              // Negozi CAL / Laboratori e magazzino / Altri punti vendita
  colore: string | null;
  attiva: boolean;
  codice: string | null;
  citta: string | null;
  indirizzo: string | null;
  email: string | null;
}

export interface AliquotaIva {
  codice: string;              // '22', '04', '0', '--', '41', '72' …
  descrizione: string;
  aliquota: Numerico;
  applicazione: string | null; // 'A' / 'C'
  id_vecchio: string | null;
}

export interface Fornitore {
  id: string;                  // uuid
  codice: string;
  ragione_sociale: string;
  partita_iva: string | null;
  codice_fiscale: string | null;
  aliquota_iva: Numerico | null;
  /** Se valorizzato il fornitore è una sede (es. 900009 MAGAZZINO CENTRALE → 'magazzino-centrale'). */
  sede_collegata: SedeId | null;
  note: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  nazione: string | null;
  telefono: string | null;
  cellulare: string | null;
  email: string | null;
  id_vecchio: string | null;
  creato_il: string;
  modificato_il: string | null;
}

/** Quali fornitori usa ogni sede (database/23-fornitori-per-sede.sql). */
export interface FornitoreSede {
  fornitore_id: string;
  sede_id: SedeId;
  creato_il: string;
}

export interface Cliente {
  id: string;
  codice: string;
  nome: string;
  tipo: string | null;
  codice_fiscale: string | null;
  partita_iva: string | null;
  email: string | null;
  telefono: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  nazione: string | null;
  id_vecchio: string | null;
  creato_il: string;
}

/** Una riga della scheda Materiali (articoli.materiali, database/30-materiali-articoli.sql). */
export interface MaterialeArticolo {
  materiale: string;
  fornitore: string;
  quantita: number;
  info: string;
  costo: number;
}

export interface Articolo {
  id: string;
  codice: string;
  descrizione: string;
  /** EAN-13 della serie interna 200… creato dal gestionale (o vecchio barcode importato). */
  barcode: string | null;
  fornitore_id: string | null;
  fornitore2_id: string | null;
  fornitore_dedotto: boolean;
  aliquota_iva: string;        // codice in aliquote_iva
  costo_lordo: Numerico;
  sconto: Numerico;
  costo_netto: Numerico;
  prezzo_vendita: Numerico;    // senza IVA
  /** Prezzo in etichetta: sempre ai 10 centesimi (trigger database/29-prezzi-ai-10-centesimi.sql). */
  prezzo_vendita_ivato: Numerico;
  ricarico: Numerico | null;   // % (100 = prezzo doppio del costo)
  arrotondamento: Numerico;
  spese_confezione: Numerico;
  spese_imballaggio: Numerico;
  spese_accessorie: Numerico;
  scorta_minima: number;
  anno_listino: number | null;
  provenienza: string | null;
  unita_misura: string | null;
  tipologia: string | null;
  categoria: string | null;
  sottocategoria: string | null;
  scaffale: string | null;     // usato solo dal Magazzino Centrale
  annotazioni: string | null;
  materiali: MaterialeArticolo[];
  attivo: boolean;             // false = disattivato (es. eliminato con l'inventario): non si cerca e non si spara
  id_vecchio: string | null;
  creato_il: string;
  modificato_il: string;
}

export interface TipoMovimento {
  codice: TipoMovimentoCodice;
  nome: string;
  segno: -1 | 0 | 1;
}

export interface Movimento {
  id: number;
  tipo: TipoMovimentoCodice;
  stato: StatoMovimento;
  sede_id: SedeId;               // sede che fa il movimento
  sede_altra_id: SedeId | null;  // trasferimenti: sede che riceve
  fornitore_id: string | null;
  cliente_id: string | null;
  protocollo: string | null;
  numero_documento: string | null;
  data_movimento: string;
  data_documento: string | null;
  data_bolla: string | null;
  causale: string | null;
  annotazioni: string | null;
  motivo: string | null;          // aumento/diminuzione; inventario: 'Tutto il magazzino' | 'Solo una parte'
  anno_acquisto: number | null;   // lotto (anno stampato sulle etichette)
  porto: string | null;
  condizione_pagamento: string | null;
  spedizioniere: string | null;
  tracking: string | null;
  colli: number | null;
  contenuto: string | null;
  peso: Numerico | null;
  spese: Numerico;
  ordine_collegato_id: number | null;
  ricevuto_il: string | null;     // trasferimenti: conferma di chi riceve (la merce entra solo allora)
  ricevuto_da: string | null;
  creato_da: string | null;
  creato_il: string;
  modificato_il: string;          // usato come "versione" per il lavoro in contemporanea
  modificato_da: string | null;
}

export interface MovimentoRiga {
  id: number;
  movimento_id: number;
  articolo_id: string;
  quantita_ordinata: Numerico | null;
  /** Pezzi del movimento (con segno solo nel riallineamento). */
  quantita: Numerico;
  quantita_contata: Numerico | null; // inventario
  azione: 'elimina' | null;          // inventario: articolo non sparato da eliminare
  ordine_riga_id: number | null;     // riga d'ordine evasa da questa riga (trasferimenti, scarichi cliente)
  prezzo: Numerico;
  sconto: Numerico;
  etichette: number;
  totale: Numerico;                  // calcolata dal database
  aggiunto_il: string | null;
}

/** Riga da mandare a `salva_movimento` (senza id, movimento_id e totale). */
export type RigaDaSalvare = Pick<MovimentoRiga, 'articolo_id'> &
  Partial<Pick<MovimentoRiga, 'quantita_ordinata' | 'quantita_contata' | 'azione' | 'ordine_riga_id' | 'sconto' | 'etichette'>> & {
    quantita: number;
    prezzo: number;
  };

/** Dati del movimento da mandare a `salva_movimento`. I campi che iniziano con "_" sono indicazioni per il database. */
export type MovimentoDaSalvare = Partial<Omit<Movimento, 'id' | 'creato_il' | 'creato_da' | 'modificato_il' | 'modificato_da'>> &
  Pick<Movimento, 'tipo' | 'stato' | 'sede_id'> & {
    _versione?: string;   // modificato_il letto: se nel frattempo è cambiato → errore CONFLITTO
    _doppia_ok?: boolean; // seconda giornata di vendite nello stesso giorno (con nota)
    _oltre_ok?: boolean;  // trasferimento che manda più di quanto ordinato
  };

export interface InevasoAnnullato {
  id: number;
  ordine_riga_id: number;
  quantita: Numerico;
  motivo: string | null;
  annullato_da: string | null;
  annullato_il: string;
}

export interface UtenteAutorizzato {
  email: string;
  nome: string | null;
  ruolo: string;          // vecchia colonna (un solo ruolo), resta per compatibilità
  ruoli: Ruolo[];
  bloccato: boolean;
  sedi: SedeId[];
  creato_il: string;
}

export interface RegistroAttivita {
  id: number;
  quando: string;
  email: string | null;
  sede: string | null;
  attivita: string;
  dettagli: string | null;
  tabella: string | null;
  riferimento: string | null;
  dispositivo: string | null;
}

// ---------- Viste (sola lettura) ----------

/** Vista `giacenze`: somma dei movimenti Definitivi/Evasi per sede e articolo (ricalcolata dal database). */
export interface Giacenza {
  sede_id: SedeId;
  articolo_id: string;
  quantita: Numerico;
}

/** Vista `inevasi`: righe d'ordine verso una sede con quanto resta da mandare. */
export interface Inevaso {
  ordine_riga_id: number;
  ordine_id: number;
  protocollo: string | null;
  data_ordine: string;
  stato_ordine: 'Definitivo' | 'Evaso';
  sede_richiedente: SedeId;
  sede_fornitrice: SedeId;
  articolo_id: string;
  ordinata: Numerico;
  trasferita: Numerico;
  annullata: Numerico;
  residuo: Numerico;
}

// ---------- Funzioni del database (RPC) ----------

export interface RpcFunzioni {
  /** true se l'utente è in utenti_autorizzati e non è bloccato. */
  e_autorizzato: { args: Record<string, never>; ritorno: boolean };
  e_amministratore: { args: Record<string, never>; ritorno: boolean };
  /**
   * Salva un movimento tutto-o-niente (database/27 e 28): controllo giacenza (mai sotto zero), lucchetto per sede/articolo,
   * versione (CONFLITTO), giornata di vendite unica (GIORNATA_ESISTE), ordine già preparato (ORDINE_GIA_PREPARATO).
   * Restituisce l'id del movimento.
   */
  salva_movimento: { args: { p_id: number | null; p_mov: MovimentoDaSalvare; p_righe: RigaDaSalvare[] }; ritorno: number };
  /** Ordine da cliente → scarico a cliente (una volta sola). Restituisce l'id dello scarico. */
  scala_ordine_cliente: { args: { p_ordine: number }; ritorno: number };

  // --- database/33-funzioni-sicure.sql ---
  /** Salva un movimento e mette "Evaso" gli ordini indicati nella stessa transazione (trasferimento da ordine, carico). */
  salva_movimento_ed_evadi: { args: { p_id: number | null; p_mov: MovimentoDaSalvare; p_righe: RigaDaSalvare[]; p_evadi: number[] }; ritorno: number };
  /** La sede che riceve conferma l'arrivo di un trasferimento (la merce entra nella sua giacenza). */
  conferma_ricezione: { args: { p_id: number }; ritorno: null };
  /** Annulla un movimento; un trasferimento già ricevuto non si annulla; controllo giacenza. */
  annulla_movimento: { args: { p_id: number }; ritorno: null };
  /** Cancella in tutto o in parte un inevaso (resta registrato). */
  annulla_inevaso: { args: { p_riga: number; p_quantita: number; p_motivo: string }; ritorno: null };
  /** Ordine scalato: si aggiornano solo i dati del documento. */
  aggiorna_documento_movimento: { args: { p_id: number; p_dati: Partial<Movimento> }; ritorno: null };
  /** Conferma l'inventario calcolando le differenze nel database. */
  conferma_inventario: { args: { p_id: number }; ritorno: { contati: number; eliminati: number; non_disattivati: string[] } };
  salva_articolo: { args: { p_id: string | null; p_dati: Partial<Articolo>; p_versione: string | null }; ritorno: string };
  salva_fornitore: { args: { p_id: string | null; p_dati: Partial<Fornitore>; p_sedi: SedeId[] | null }; ritorno: string };
  salva_cliente: { args: { p_id: string | null; p_dati: Partial<Cliente> }; ritorno: string };
  salva_utente: { args: { p_email: string; p_dati: Partial<Pick<UtenteAutorizzato, 'nome' | 'ruoli' | 'bloccato' | 'sedi'>>; p_nuovo: boolean }; ritorno: null };
  registra_evento: { args: { p_attivita: string; p_dettagli: string; p_sede: string | null; p_dispositivo: string | null }; ritorno: null };
  /** Giacenze di una sede, una pagina alla volta (con il totale delle righe in ogni riga). */
  giacenze_sede: {
    args: { p_sede: SedeId; p_cerca: string | null; p_solo_presenti: boolean; p_sotto_scorta: boolean; p_da: number; p_quanti: number };
    ritorno: GiacenzaSedeRiga[];
  };
  /** Elenco Articoli: una pagina con filtri, ricerca, schede e giacenza della sede. */
  articoli_elenco: { args: ArticoliElencoArgs; ritorno: ArticoloElencoRiga[] };
  articoli_conteggi: { args: { p_sede: SedeId }; ritorno: { tutti: number; disponibili: number; esauriti: number; negativi: number }[] };
  /** Scheda articolo: lotti per anno di acquisto nella sede (uscite dal lotto più vecchio). */
  articolo_lotti: { args: { p_articolo: string; p_sede: SedeId }; ritorno: LottoArticolo[] };
  /** Scheda articolo: movimenti nella sede dal più recente, una pagina alla volta. */
  articolo_movimenti: { args: { p_articolo: string; p_sede: SedeId; p_da: number; p_quanti: number }; ritorno: MovimentoArticolo[] };
  /** Scheda articolo: giacenza, in arrivo, prenotati e disponibile previsto per ogni sede attiva. */
  articolo_previsto: { args: { p_articolo: string }; ritorno: PrevistoSede[] };
  /** Prima di salvare: codici quasi uguali e barcode già usati da altri articoli. */
  articoli_simili: { args: { p_codice: string | null; p_barcode: string | null; p_escludi: string | null }; ritorno: { codice: string; descrizione: string; motivo: 'codice' | 'barcode' }[] };
}

export interface LottoArticolo {
  anno: number;
  iniziale: Numerico;
  caricata: Numerico;
  venduta: Numerico;
  altre_uscite: Numerico;
  finale: Numerico;
}

export interface MovimentoArticolo {
  movimento_id: number;
  data: string;
  tipo: string;            // codice del tipo, o 'trasferimento_ricevuto'
  nome: string;
  stato: string;
  q: Numerico;
  prima: Numerico;
  dopo: Numerico;
  /** anno di acquisto → pezzi (+ entrati, − usciti) */
  lotti: Record<string, number>;
  ordinati: Numerico;
  prenotati: Numerico;
  totale: number;
}

export interface PrevistoSede {
  sede_id: SedeId;
  sede_nome: string;
  giacenza: Numerico;
  in_arrivo: Numerico;
  prenotati: Numerico;
  previsto: Numerico;
}

export type SchedaArticoli = '' | 'disp' | 'esauriti' | 'neg';
export type OrdinaArticoli = 'codice' | 'descrizione' | 'giacenza' | 'prezzo' | 'barcode' | 'iva';

export interface ArticoliElencoArgs {
  p_sede: SedeId;
  p_cerca: string | null;
  p_fornitore: string | null;
  p_cod_da: string | null;
  p_cod_a: string | null;
  p_anno: number | null;
  p_prezzo_min: number | null;
  p_prezzo_max: number | null;
  p_iva: number | null;
  p_scheda: SchedaArticoli;
  p_solo_giacenza: boolean;
  p_ordina: OrdinaArticoli;
  p_crescente: boolean;
  p_da: number;
  p_quanti: number;
}

export interface ArticoloElencoRiga {
  id: string;
  codice: string;
  descrizione: string;
  barcode: string | null;
  costo_netto: Numerico;
  prezzo_vendita_ivato: Numerico;
  iva: Numerico;
  fornitore_id: string | null;
  anno_listino: number | null;
  /** null = mai movimentato in questa sede */
  quantita: Numerico | null;
  totale: number;
}

export interface GiacenzaSedeRiga {
  articolo_id: string;
  codice: string;
  descrizione: string;
  barcode: string | null;
  costo_netto: Numerico;
  prezzo_vendita_ivato: Numerico;
  scorta_minima: number;
  quantita: Numerico;
  totale: number;
}

export type NomeRpc = keyof RpcFunzioni;

// ---------- Paginazione lato server ----------

export interface Pagina<T> {
  righe: T[];
  totale: number;   // count esatto restituito dal database
  pagina: number;   // da 0
  perPagina: number;
}
