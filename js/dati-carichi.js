// Carichi da fornitori di esempio: usati dall'elenco (carichi-fornitori.html) e dalla scheda (carico.html).
// cp = indice in FORNITORI (dati-esempio.js).
const CARICHI = [
  { id: 8816, doc: "n.247", dataDoc: "2026-10-14", stato: "Annullato", data: "2026-10-19", cp: 0, bolla: "2026-10-14", causale: "", totArt: 0, tot: 0, nArt: 0, lab: "Laboratorio Ceramiche" },
  { id: 8815, doc: "n.247", dataDoc: "2026-10-14", stato: "Definitivo", data: "2026-10-19", cp: 0, bolla: "2026-10-14", causale: "", totArt: 986.55, tot: 986.55, nArt: 33, lab: "Laboratori Sede Centrale" },
  { id: 8814, doc: "n.774", dataDoc: "2026-10-16", stato: "Definitivo", data: "2026-10-19", cp: 1, bolla: "2026-10-16", causale: "", totArt: 760.67, tot: 770.67, nArt: 36, lab: "Laboratorio Confezione Sede Centrale" },
  { id: 8809, doc: "n.51", dataDoc: "2026-10-17", stato: "Provvisorio", data: "2026-10-18", cp: 5, bolla: "2026-10-17", causale: "Riassortimento", totArt: 214.2, tot: 224.2, nArt: 60, lab: "Laboratori Sede Centrale" },
  { id: 8800, doc: "n.167 DDT", dataDoc: "2026-10-14", stato: "Definitivo", data: "2026-10-15", cp: 3, bolla: "2026-10-14", causale: "", totArt: 376.8, tot: 416.8, nArt: 14, lab: "Laboratori Sede Centrale" },
  { id: 8796, doc: "n.825", dataDoc: "2026-10-13", stato: "Definitivo", data: "2026-10-15", cp: 4, bolla: "2026-10-13", causale: "", totArt: 172, tot: 184, nArt: 14, lab: "Laboratorio Ceramiche" },
  { id: 8782, doc: "n.224", dataDoc: "2026-10-13", stato: "Definitivo", data: "2026-10-14", cp: 6, bolla: "2026-10-13", causale: "", totArt: 337.33, tot: 352.33, nArt: 201, lab: "Laboratorio Cinisello Balsamo" },
  { id: 8770, doc: "n.12", dataDoc: "2026-10-10", stato: "Provvisorio", data: "2026-10-12", cp: 2, bolla: "2026-10-10", causale: "Conto visione", totArt: 1240, tot: 1240, nArt: 8, lab: "Laboratori Sede Centrale" },
  { id: 8758, doc: "n.2942", dataDoc: "2026-10-09", stato: "Definitivo", data: "2026-10-12", cp: 1, bolla: "2026-10-09", causale: "", totArt: 168.19, tot: 179.19, nArt: 10, lab: "Laboratorio Confezione Sede Centrale" },
  { id: 8744, doc: "n.560", dataDoc: "2026-09-29", stato: "Definitivo", data: "2026-10-09", cp: 6, bolla: "2026-09-29", causale: "", totArt: 398.69, tot: 398.69, nArt: 344, lab: "Laboratori Sede Centrale" },
  { id: 8732, doc: "n.1098", dataDoc: "2026-10-02", stato: "Definitivo", data: "2026-10-07", cp: 0, bolla: "2026-10-02", causale: "Nuova collezione", totArt: 807.49, tot: 819.22, nArt: 86, lab: "Laboratori Sede Centrale" },
  { id: 8704, stato: "Annullato", data: "2026-10-05", cp: 2, bolla: "", causale: "", totArt: 0, tot: 0, nArt: 0, lab: "Laboratori Sede Centrale" },
  { id: 8690, doc: "n.88", dataDoc: "2026-10-01", stato: "Definitivo", data: "2026-10-02", cp: 5, bolla: "2026-10-01", causale: "", totArt: 95.4, tot: 102.4, nArt: 120, lab: "Laboratori Sede Centrale" },
  { id: 8675, doc: "n.403", dataDoc: "2026-09-25", stato: "Definitivo", data: "2026-09-28", cp: 2, bolla: "2026-09-25", causale: "", totArt: 2310.5, tot: 2310.5, nArt: 12, lab: "Laboratori Sede Centrale" }
];

// Ordini a fornitore ancora aperti, collegabili a un nuovo carico (cp = indice in FORNITORI)
const ORDINI_APERTI = [
  { prot: "2026-000184", data: "2026-10-21", cp: 6, righe: [["C1001", 6], ["C1002", 6], ["C2001", 2]] },
  { prot: "2026-000181", data: "2026-10-15", cp: 7, righe: [["E0102", 20], ["E0101", 4]] },
  { prot: "2026-000176", data: "2026-10-12", cp: 0, righe: [["A0110/11", 3], ["A0110/12", 2], ["A0110/14", 3], ["A0101", 1]] },
  { prot: "2026-000170", data: "2026-10-06", cp: 1, righe: [["C1001", 10], ["D0501", 30]] }
];

// Righe articolo di un carico (richiede dati-articoli.js). Sempre le stesse per lo stesso carico:
// gli articoli vengono dall'anagrafica, le quantità ripartiscono i pezzi e gli importi chiudono il totale al centesimo.
function righeCarico(c) {
  if (!c.nArt) return [];
  let seme = c.id;
  const caso = () => (seme = (seme * 9301 + 49297) % 233280) / 233280;
  const n = Math.min(c.id === 8815 ? 13 : 4 + Math.floor(caso() * 9), c.nArt, ARTICOLI.length);
  const qta = Array(n).fill(1);
  for (let i = n; i < c.nArt; i++) qta[Math.floor(caso() * n)]++;
  const pesi = qta.map(q => q * (0.5 + caso()));
  const somma = pesi.reduce((a, b) => a + b, 0);
  let resto = c.totArt;
  return qta.map((q, i) => {
    const tot = i === n - 1 ? Math.round(resto * 100) / 100 : Math.round(c.totArt * pesi[i] / somma * 100) / 100;
    resto -= tot;
    // passo 7 su 20 articoli: nessun articolo ripetuto nello stesso carico
    const art = ARTICOLI[(c.id + i * 7) % ARTICOLI.length];
    return { pos: i + 1, cod: art.codice, descr: art.descr, qta: q, tot, prezzo: tot / q, sconto: 0, etichette: q, barcode: art.barcode, articolo: art };
  });
}
