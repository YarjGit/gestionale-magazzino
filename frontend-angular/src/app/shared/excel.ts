// File Excel (.xlsx veri) senza librerie, come prototipo/js/excel.js: un .xlsx è uno zip di file XML.
import { intestazioneSede } from './intestazioni';

const CRC_TAB = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b: Uint8Array): number => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TAB[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** Zip senza compressione (bastano pochi KB di testo). */
function zipFile(file: [string, string][]): Blob {
  const enc = new TextEncoder(), parti: Uint8Array[] = [], centrale: Uint8Array[] = [];
  let pos = 0;
  const u16 = (n: number): number[] => [n & 255, (n >>> 8) & 255], u32 = (n: number): number[] => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const [nome, testo] of file) {
    const n = enc.encode(nome), d = enc.encode(testo), c = crc32(d);
    const comune = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x5c21), ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(n.length), ...u16(0)];
    const testa = new Uint8Array([...u32(0x04034b50), ...comune]);
    parti.push(testa, n, d);
    centrale.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...comune, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(pos)]), n);
    pos += testa.length + n.length + d.length;
  }
  const lungC = centrale.reduce((s, b) => s + b.length, 0);
  const fine = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(file.length), ...u16(file.length), ...u32(lungC), ...u32(pos), ...u16(0)]);
  return new Blob([...parti, ...centrale, fine].map(b => b.slice().buffer), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export type Cella = string | number;
export interface Foglio {
  nome: string;
  larghezze?: number[];
  righe: Cella[][];
  /** "colonna" = prima colonna grigia; "riga" = prima riga grigia e bloccata */
  intestazione?: 'colonna' | 'riga';
  formati?: ('euro' | 'intero' | undefined)[];
}

export function cartellaExcel(fogli: Foglio[]): Blob {
  const xml = (s: Cella): string => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const lettera = (i: number): string => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  const foglio = (f: Foglio): string => {
    const righe = f.righe.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      const rif = lettera(ci) + (ri + 1);
      const grigia = (f.intestazione === 'riga' && ri === 0) || (f.intestazione === 'colonna' && ci === 0);
      if (grigia) return `<c r="${rif}" s="2" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
      if (typeof v === 'number' && isFinite(v)) return `<c r="${rif}" s="${f.formati?.[ci] === 'intero' || (!f.formati && Number.isInteger(v)) ? 3 : 1}"><v>${v}</v></c>`;
      return `<c r="${rif}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const blocca = f.intestazione === 'riga' ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
    const colonne = f.larghezze?.length ? `<cols>${f.larghezze.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${blocca}${colonne}<sheetData>${righe}</sheetData></worksheet>`;
  };
  const ns = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
  return zipFile([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${fogli.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships ${ns}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${fogli.map((f, i) => `<sheet name="${xml(f.nome).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships ${ns}>${fogli.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${fogli.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE3EE"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`],
    ...fogli.map((f, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, foglio(f)])
  ]);
}

export function scaricaFile(nome: string, blob: Blob): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome.replace(/[\\/:*?"<>|]+/g, '-');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

export interface RigaExcel { codice: string; descr: string; anno: number | string | null; prezzo: number; sconto: number; qta: number; unita?: string | null; iva: number }

/** Excel di un movimento come quello del gestionale attuale: fogli "Riepilogo" e "Dettaglio", nome "ENTE_Tipo_N_#id.xlsx". */
export function excelMovimento(d: { sede: string; tipo: string; numero: number | null; riepilogo: [string, Cella][]; righe: RigaExcel[]; spese?: [string, number][]; ivaInclusa?: boolean }): void {
  const cent = (n: number): number => Math.round((+n || 0) * 100 + 1e-9) / 100;
  const ente = intestazioneSede(d.sede)[1];
  const righe = d.righe.map(r => {
    const scontato = cent(r.prezzo * (1 - (r.sconto || 0) / 100));
    return { ...r, scontato, totale: cent(r.qta * scontato * (d.ivaInclusa ? 1 : 1 + (r.iva || 0) / 100)) };
  });
  const totArt = cent(righe.reduce((s, r) => s + r.totale, 0));
  const spese = d.spese ?? [];
  const riepilogo: Cella[][] = ([['Ente', ente], ['Tipo Documento', d.tipo], ['Numero Documento', d.numero ?? ''], ...d.riepilogo] as [string, Cella][])
    .map(([e, v]): Cella[] => [e, v == null ? '' : String(v)])
    .concat([['Totale Articoli', totArt], ...spese.map(([e, v]): Cella[] => [e, cent(v)]), ['Totale Documento', cent(totArt + spese.reduce((s, [, v]) => s + (+v || 0), 0))]]);
  const interi = righe.every(r => Number.isInteger(+r.qta));
  scaricaFile(`${ente}_${d.tipo}_N_#${d.numero ?? 'nuovo'}.xlsx`, cartellaExcel([
    { nome: 'Riepilogo', larghezze: [27, 40], intestazione: 'colonna', righe: riepilogo },
    { nome: 'Dettaglio', larghezze: [20, 57, 7, 22, 10, 30, 10, 9, 6, 20], intestazione: 'riga',
      formati: [undefined, undefined, 'intero', 'euro', 'euro', 'euro', interi ? 'intero' : 'euro', undefined, 'intero', 'euro'],
      righe: [['Codice', 'Descrizione', 'Anno', 'Prezzo Unitario (EURO)', 'Sconto %', 'Prezzo Unitario Scontato (EURO)', 'Quantità', 'Unità', 'IVA', 'Prezzo Totale (EURO)'] as Cella[]]
        .concat(righe.map(r => [r.codice, r.descr, r.anno ? +r.anno : '', cent(r.prezzo), +r.sconto || 0, r.scontato, +r.qta, r.unita || 'Numero', +r.iva || 0, r.totale])) }
  ]));
}

/** Righe "Fornitore - …" del Riepilogo. */
export const riepilogoFornitore = (f: { ragione_sociale?: string | null; codice_fiscale?: string | null; partita_iva?: string | null; citta?: string | null; provincia?: string | null; cap?: string | null; indirizzo?: string | null } | null, nome: string): [string, Cella][] => [
  ['Fornitore - Ragione Sociale', f?.ragione_sociale ?? nome], ['Fornitore - Codice Fiscale', f?.codice_fiscale ?? ''], ['Fornitore - Partita IVA', f?.partita_iva ?? ''],
  ['Fornitore - Citta', f?.citta ?? ''], ['Fornitore - Provincia', f?.provincia ?? ''], ['Fornitore - CAP', f?.cap ?? ''], ['Fornitore - Indirizzo', f?.indirizzo ?? '']];

/** Tabella semplice in un foglio (elenchi): i numeri scritti all'italiana diventano numeri veri. */
export function tabellaExcel(nome: string, foglio: string, righe: Cella[][]): void {
  const numIt = (v: Cella): Cella => (typeof v === 'string' && /^-?\d{1,3}(\.\d{3})*,\d+$/.test(v.trim()) ? +v.trim().replace(/\./g, '').replace(',', '.') : v);
  const dati = righe.map((r, i) => (i ? r.map(numIt) : r));
  const larghezze = (dati[0] ?? []).map((_, c) => Math.min(60, Math.max(8, ...dati.slice(0, 200).map(r => String(r[c] ?? '').length + 2))));
  scaricaFile(nome.replace(/\.(csv|xlsx)$/i, '') + '.xlsx', cartellaExcel([{ nome: foglio, intestazione: 'riga', larghezze, righe: dati }]));
}
