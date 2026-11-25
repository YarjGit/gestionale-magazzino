// Esporta una tabella in un file CSV che Excel apre direttamente (separatore ";" e accenti corretti).
export function esportaCsv(nomeFile: string, righe: (string | number | null | undefined)[][]): void {
  const testo = righe
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + testo], { type: 'text/csv;charset=utf-8' }));
  a.download = nomeFile.endsWith('.csv') ? nomeFile : `${nomeFile}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
