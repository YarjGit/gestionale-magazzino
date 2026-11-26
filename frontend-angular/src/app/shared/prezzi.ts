// Calcolo del prezzo di un articolo (stesso calcolo di prototipo/articolo.html, anteprima: il database arrotonda e salva).
// (costo netto + spese) × (1 + ricarico) = prezzo senza IVA; + IVA; + arrotondamento = prezzo di vendita finale (etichetta).
import { cent } from './formato';

export interface ValoriPrezzo {
  costoLordo: number;
  sconto: number;          // %
  ricarico: number;        // % (100 = doppio del costo)
  iva: number;             // %
  confezione: number;
  imballaggio: number;
  accessorie: number;
  arrotondamento: number;
}

export interface Calcolo {
  costoNetto: number;      // prezzo scontato
  spese: number;
  prezzoVendita: number;   // senza IVA
  importoIva: number;
  conIva: number;
  etichetta: number;       // prezzo di vendita finale
}

export function calcola(v: ValoriPrezzo): Calcolo {
  const costoNetto = cent(v.costoLordo * (1 - v.sconto / 100));
  const spese = cent(v.confezione + v.imballaggio + v.accessorie);
  const prezzoVendita = cent((costoNetto + spese) * (1 + v.ricarico / 100));
  const conIva = cent(prezzoVendita * (1 + v.iva / 100));
  return { costoNetto, spese, prezzoVendita, importoIva: cent(conIva - prezzoVendita), conIva, etichetta: cent(conIva + v.arrotondamento) };
}

/** Prezzo finale ai 10 centesimi: fino a 10,04 → 10,00; da 10,05 → 10,10 (come il trigger 29 del database). */
export const aiDieciCentesimi = (p: number): number => Math.round(Math.round((Number(p) || 0) * 100) / 10) / 10;
/** Arrotondamento che porta il prezzo con IVA ai 10 centesimi. */
export const arrotondamentoDieci = (conIva: number): number => cent(aiDieciCentesimi(conIva) - conIva);
/** Arrotondamento all'euro superiore (tasto ↑ €). */
export const arrotondamentoEuro = (etichetta: number): number => cent(Math.ceil(etichetta - 0.001) - etichetta);

/** Costo d'acquisto in lettere, come sulle etichette: M=1 A=2 G=3 I=4 S=5 T=6 E=7 R=8 P=9 D=0 (15,00 → MS-DD). */
export const costoInLettere = (v: number): string =>
  (Math.round((Number(v) || 0) * 100) / 100).toFixed(2).split('.').map(p => [...p].map(c => 'DMAGISTERP'[+c]).join('')).join('-');

/** IVA dell'articolo: 22%, ostie 4%, libri 0% (codici della tabella aliquote_iva). */
export const ALIQUOTE_ARTICOLO: { codice: string; testo: string; perc: number }[] = [
  { codice: '22', testo: '22%', perc: 22 },
  { codice: '04', testo: '4% (ostie)', perc: 4 },
  { codice: '0', testo: '0% (libri)', perc: 0 }
];
export const percIva = (codice: string | null | undefined): number => ALIQUOTE_ARTICOLO.find(a => a.codice === codice)?.perc ?? 22;
