// Tasto "Esporta" degli elenchi: un vero file Excel (.xlsx), mai CSV (regola del progetto, come il prototipo).
// Il nome resta "esportaCsv" per non cambiare tutte le pagine che lo usano.
import { tabellaExcel } from './excel';

export function esportaCsv(nomeFile: string, righe: (string | number | null | undefined)[][]): void {
  const foglio = nomeFile.replace(/[-_]/g, ' ').replace(/^\w/, c => c.toUpperCase()).slice(0, 31) || 'Elenco';
  tabellaExcel(nomeFile, foglio, righe.map(r => r.map(v => v ?? '')));
}
