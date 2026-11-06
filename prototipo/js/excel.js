// Tasto "Excel" delle schede movimento: un vero file .xlsx come quello del gestionale attuale,
// con due fogli: "Riepilogo" (sede, documento, fornitore o sede, totali e spese) e "Dettaglio" (gli articoli).
// Nome del file: "APOSTOLATO LITURGICO SMM ROMA_Carico da Fornitore_N_#8966.xlsx".
// Il file si crea nel browser, senza librerie: un .xlsx è uno zip di file XML.

// ---------- Zip senza compressione (basta per pochi KB di testo) ----------
const CRC_TAB = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TAB[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zipFile(file) {   // file: [[nome, testo]]
  const enc = new TextEncoder(), parti = [], centrale = [];
  let pos = 0;
  const u16 = n => [n & 255, (n >>> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const [nome, testo] of file) {
    const n = enc.encode(nome), d = enc.encode(testo), c = crc32(d);
    // versione 20, flag 0x0800 = nomi in UTF-8, metodo 0 = nessuna compressione, data fissa 1/1/2026
    const comune = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x5c21), ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(n.length), ...u16(0)];
    const testa = new Uint8Array([...u32(0x04034b50), ...comune]);
    parti.push(testa, n, d);
    centrale.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...comune, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(pos)]), n);
    pos += testa.length + n.length + d.length;
  }
  const lungC = centrale.reduce((s, b) => s + b.length, 0);
  const fine = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(file.length), ...u16(file.length), ...u32(lungC), ...u32(pos), ...u16(0)]);
  return new Blob([...parti, ...centrale, fine], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ---------- Cartella Excel ----------
// fogli: [{ nome, larghezze: [24, 35], righe: [[valori]], intestazione: "colonna" (prima colonna grigia) | "riga" (prima riga grigia e bloccata),
//           formati: ["euro" | "intero" | undefined per colonna] }]
// Un numero diventa un numero vero di Excel (si può sommare); "euro" = due decimali.
function cartellaExcel(fogli) {
  const xml = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  const lettera = i => { let s = ""; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  const foglio = f => {
    const righe = f.righe.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      const rif = lettera(ci) + (ri + 1);
      const grigia = (f.intestazione === "riga" && ri === 0) || (f.intestazione === "colonna" && ci === 0);
      if (grigia) return `<c r="${rif}" s="2" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
      if (typeof v === "number" && isFinite(v)) return `<c r="${rif}" s="${(f.formati || [])[ci] === "intero" ? 3 : 1}"><v>${v}</v></c>`;
      return `<c r="${rif}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join("")}</row>`).join("");
    const blocca = f.intestazione === "riga" ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : "";
    const colonne = (f.larghezze || []).length ? `<cols>${f.larghezze.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${blocca}${colonne}<sheetData>${righe}</sheetData></worksheet>`;
  };
  const ns = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
  return zipFile([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${fogli.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships ${ns}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${fogli.map((f, i) => `<sheet name="${xml(f.nome).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships ${ns}>${fogli.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${fogli.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    // stili: 0 normale, 1 numero con due decimali, 2 intestazione grigia con bordo, 3 numero intero
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE3EE"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`],
    ...fogli.map((f, i) => [`xl/worksheets/sheet${i + 1}.xml`, foglio(f)])
  ]);
}

function scaricaFile(nome, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome.replace(/[\\/:*?"<>|]+/g, "-");
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

// ---------- Excel di un movimento, come quello del gestionale attuale ----------
// d: { sede, tipo ("Carico da Fornitore"…), numero, riepilogo: [[etichetta, valore]] (dopo Ente / Tipo / Numero),
//      righe: [{ codice, descr, anno, prezzo, sconto, qta, unita, iva }], spese: [[etichetta, importo]] }
// Prezzo totale di riga = quantità × prezzo scontato + IVA (con d.ivaInclusa, vendite: niente IVA in più), al centesimo; Totale documento = articoli + spese.
function excelMovimento(d) {
  const cent = n => Math.round((+n || 0) * 100 + 1e-9) / 100;
  const ente = typeof intestazioneSede === "function" ? intestazioneSede(d.sede)[1] : String(d.sede || "").toUpperCase();
  const righe = d.righe.map(r => {
    const scontato = cent(r.prezzo * (1 - (r.sconto || 0) / 100));
    return { ...r, scontato, totale: cent(r.qta * scontato * (d.ivaInclusa ? 1 : 1 + (r.iva || 0) / 100)) };
  });
  const totArt = cent(righe.reduce((s, r) => s + r.totale, 0));
  const spese = d.spese || [];
  // nel Riepilogo sono numeri solo i totali e le spese (il numero del documento o un anno non diventano "8.966,00")
  const riepilogo = [["Ente", ente], ["Tipo Documento", d.tipo], ["Numero Documento", d.numero ?? ""], ...d.riepilogo].map(([e, v]) => [e, v == null ? "" : String(v)]).concat([
    ["Totale Articoli", totArt], ...spese.map(([e, v]) => [e, cent(v)]), ["Totale Documento", cent(totArt + spese.reduce((s, [, v]) => s + (+v || 0), 0))]]);
  const intero = n => Number.isInteger(+n);
  scaricaFile(`${ente}_${d.tipo}_N_#${d.numero ?? "nuovo"}.xlsx`, cartellaExcel([
    { nome: "Riepilogo", larghezze: [27, 40], intestazione: "colonna", righe: riepilogo },
    { nome: "Dettaglio", larghezze: [20, 57, 7, 22, 10, 30, 10, 9, 6, 20], intestazione: "riga",
      formati: [, , "intero", "euro", "euro", "euro", righe.every(r => intero(r.qta)) ? "intero" : "euro", , "intero", "euro"],
      righe: [["Codice", "Descrizione", "Anno", "Prezzo Unitario (EURO)", "Sconto %", "Prezzo Unitario Scontato (EURO)", "Quantità", "Unità", "IVA", "Prezzo Totale (EURO)"]]
        .concat(righe.map(r => [r.codice, r.descr, r.anno ? +r.anno : "", cent(r.prezzo), +r.sconto || 0, r.scontato, +r.qta, r.unita || "Numero", +r.iva || 0, r.totale])) }
  ]));
}

// Righe "Fornitore - …" del Riepilogo, dalla scheda del fornitore nel database (indirizzi: database/19-indirizzi-fornitori.sql)
const riepilogoFornitore = (forn, nome) => [["Fornitore - Ragione Sociale", forn ? forn.ragione_sociale : nome || ""],
  ["Fornitore - Codice Fiscale", forn && forn.codice_fiscale || ""], ["Fornitore - Partita IVA", forn && forn.partita_iva || ""],
  ["Fornitore - Citta", forn && forn.citta || ""], ["Fornitore - Provincia", forn && forn.provincia || ""],
  ["Fornitore - CAP", forn && forn.cap || ""], ["Fornitore - Indirizzo", forn && forn.indirizzo || ""]];

// Spese scritte nella scheda (campi .spesa con la loro etichetta, es. "+ Spese trasporto"): [["Spese trasporto", 12.5]]
const speseDallaPagina = () => [...document.querySelectorAll(".spesa")].map(i => {
  const etichetta = (i.closest(".voce-imp, .f") || i.parentElement).querySelector("label");
  return [(etichetta ? etichetta.textContent : "Spese").replace(/^\s*\+\s*/, "").trim(), +String(i.value).replace(/\./g, "").replace(",", ".") || 0];
});

// Fornitore letto dal database (null per quelli di esempio)
async function fornitoreDb(id) {
  const db = /^[0-9a-f-]{36}$/i.test(id || "") ? await dbPronto : null;
  return db ? (await db.from("fornitori").select("*").eq("id", id).maybeSingle()).data : null;
}
