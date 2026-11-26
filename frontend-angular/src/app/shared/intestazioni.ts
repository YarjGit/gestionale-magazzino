// Carta intestata dei documenti stampati (prototipo/js/intestazioni.js): righe in alto a sinistra per ogni sede, piè di pagina comune.

export const ENTE = 'Provincia Italiana Pie Discepole del Divin Maestro';
const INTESTAZIONI: Record<string, string[]> = {
  'CAL SMM Roma': [ENTE, 'APOSTOLATO LITURGICO SMM ROMA', 'Largo Brancaccio, 57', '00184 Roma (RM)', 'Telefono: 06.48.14.794'],
  'CAL Roma per Estero': [ENTE, 'APOSTOLATO LITURGICO ROMA PER ESTERO', 'Largo Brancaccio, 57', '00184 Roma (RM)', 'Telefono: 06.656.86.355'],
  'Magazzino Centrale': [ENTE, 'MAGAZZINO CENTRALE', 'Via Portuense, 739', '00148 Roma (RM)', 'Telefono: 06.65.65.62.24']
};
export const PIE_DI_PAGINA = [
  'Provincia Italiana della Congregazione delle Pie Discepole del Divin Maestro',
  'Largo Brancaccio, 57',
  'Tel. 06.65.68.62.22',
  'C.C.I.A.A. Roma n. 359210 - Cod. Fiscale 0046876052'
];
export const intestazioneSede = (nome: string): string[] => INTESTAZIONI[nome] ?? [ENTE, nome.toUpperCase()];

/** Dati anagrafici di un fornitore o cliente per il destinatario delle stampe. */
export interface Anagrafica {
  ragione_sociale?: string | null; nome?: string | null; indirizzo?: string | null; cap?: string | null; citta?: string | null; provincia?: string | null;
  nazione?: string | null; partita_iva?: string | null; codice_fiscale?: string | null; telefono?: string | null; cellulare?: string | null; email?: string | null;
}

/** Destinatario completo (in alto a destra): nome, via, CAP città (provincia), nazione se estera, P.IVA, C.F. se diverso, contatti. */
export function righeDestinatario(x: Anagrafica | null, nome?: string): string[] {
  if (!x) return nome ? [nome] : [];
  const cf = x.codice_fiscale && x.codice_fiscale !== x.partita_iva ? x.codice_fiscale : '';
  return [nome || x.ragione_sociale || x.nome || '', x.indirizzo ?? '',
    [x.cap, x.citta, x.provincia ? `(${x.provincia})` : ''].filter(Boolean).join(' '),
    x.nazione && !/^ital/i.test(x.nazione) ? x.nazione.toUpperCase() : '',
    x.partita_iva ? 'P.IVA: ' + x.partita_iva : '', cf ? 'C.F.: ' + cf : '',
    x.telefono ? 'Telefono: ' + x.telefono : '', x.cellulare ? 'Cellulare: ' + x.cellulare : '', x.email ? 'Email: ' + x.email : ''].filter(Boolean);
}

/** Una sede come destinatario: i dati del fornitore collegato a lei, altrimenti la sua carta intestata senza l'ente. */
export const destinatarioSede = (nome: string, fornitoreSede: Anagrafica | null): string[] =>
  fornitoreSede ? righeDestinatario(fornitoreSede, nome.toUpperCase()) : intestazioneSede(nome).filter(r => r !== ENTE);

/** Documento da stampare su carta intestata (pagina /stampa, come stampa-documento.html). */
export interface DocumentoStampa {
  titolo: string;
  sede: string;
  /** righe della carta intestata di chi manda, quando la sede non ne ha una scritta qui (es. dati del suo fornitore collegato) */
  mittente?: string[] | null;
  info: [string, string][];
  destinatario: string[];
  colonne: { k: string; t: string; num?: boolean; cod?: boolean }[];
  righe: Record<string, string | number>[];
  totali: [string, string][];
  note?: string;
  ritorno: string;
}

/** Etichette da stampare (pagina /etichette): passate dalla scheda movimento nella stessa scheda del browser. */
export interface EtichetteDaStampare {
  titolo: string;
  ritorno: string;
  righe: { art: { codice: string; descr: string; barcode: string; costo: number; prezzo: number }; n: number; anno: number }[];
}

export function salvaPerStampa(chiave: 'stampa' | 'etichette', dati: DocumentoStampa | EtichetteDaStampare): void {
  try { sessionStorage.setItem(chiave, JSON.stringify(dati)); } catch { /* senza memoria del browser la stampa non si apre */ }
}

/** true se la sede ha la sua carta intestata scritta qui. */
export const haIntestazione = (nome: string): boolean => nome in INTESTAZIONI;

/** DDT da stampare (pagina /stampa-ddt, come stampa-ddt.html): "DA CONSEGNARE A" è sempre il cliente. */
export interface DdtStampa {
  titolo: string;
  sede: string;
  numBolla: string;
  dataBolla: string;
  consegna: string[];
  codiceCliente: string;
  colli: string;
  contenuto: string;
  peso: string;
  porto: string;
  corriere: string;
  tracking: string;
  quantitaTotale: string;
  righe: { n: number; cod: string; descr: string; qta: string }[];
  ritorno: string;
}
export function salvaDdt(d: DdtStampa): void {
  try { sessionStorage.setItem('ddt', JSON.stringify(d)); } catch { /* senza memoria del browser la stampa non si apre */ }
}
