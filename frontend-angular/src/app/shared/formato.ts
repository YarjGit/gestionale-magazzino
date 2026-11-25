// Formati usati in tutte le schermate (come layout.js del prototipo): prezzi sempre con due decimali.

const pezzi = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });

/** 1234.5 → "1.234,50" (punto delle migliaia anche sotto i 10.000, come il prototipo) */
export function numero(v: number): string {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  const [interi, dec] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}${interi.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}
/** 1234.5 → "1.234,50 €" */
export const euro = (v: number): string => `${numero(v)} €`;
/** Quantità: interi senza decimali, metri con i decimali (12 / 1,5). */
export const quantita = (v: number): string => pezzi.format(Number(v) || 0);
/** '2026-11-26' → '26/11/2026' */
export const dataIt = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
/** Arrotonda al centesimo. */
export const cent = (v: number): number => Math.round((Number(v) || 0) * 100) / 100;
/** Testo bianco o scuro in base al colore di sfondo (tasto sede). */
export function coloreTesto(hex: string | null | undefined): string {
  if (!hex) return '#1d2433';
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1d2433' : '#ffffff';
}
/** Numero scritto all'italiana ("1.234,5") → 1234.5 */
export const leggiNumero = (s: string): number => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0;
