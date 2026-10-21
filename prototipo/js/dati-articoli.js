// Ricerca articoli comune a tutte le pagine: il testo scritto si divide in parole e
// ogni parola deve comparire (anche a metà, in qualsiasi ordine) nel codice, nel nome o nel barcode.
// Es. "calice avorio" trova "CALICE CERAMICA AVORIO"; "a0110" trova tutti i codici che lo contengono.
const normalizza = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function corrispondeArticolo(a, testo) {
  const parole = normalizza(testo).split(/\s+/).filter(Boolean);
  if (!parole.length) return true;
  // il testo in cui cercare si prepara una volta sola per articolo
  if (a._ricerca === undefined) a._ricerca = normalizza(`${a.codice} ${a.descr} ${a.barcode}`);
  return parole.every(p => a._ricerca.includes(p));
}

// Legge tutti gli articoli dal database e li mette in ARTICOLI al posto di quelli di esempio.
// sedeId: sede di cui mostrare la giacenza (es. "cal-smm-roma"). Restituisce quanti articoli ha letto.
async function caricaArticoliDalDb(db, sedeId) {
  const letti = [];
  for (let da = 0; ; da += 1000) {   // il database ne restituisce al massimo 1000 per volta
    const { data, error } = await db.from("articoli")
      .select("id, codice, descrizione, barcode, fornitore_id, costo_netto, prezzo_vendita_ivato, anno_listino, scorta_minima, aliquote_iva(aliquota)")
      .order("codice").range(da, da + 999);
    if (error) throw error;
    letti.push(...data);
    if (data.length < 1000) break;
  }
  const { data: giac, error: errGiac } = await db.from("giacenze").select("articolo_id, sede_id, quantita");
  if (errGiac) throw errGiac;
  const giacenza = new Map(giac.filter(g => g.sede_id === sedeId).map(g => [g.articolo_id, g.quantita]));
  ARTICOLI.length = 0;
  letti.forEach(a => ARTICOLI.push({
    id: a.id, codice: a.codice, descr: a.descrizione, barcode: a.barcode || "",
    costo: +a.costo_netto, prezzo: +a.prezzo_vendita_ivato,
    giac: giacenza.has(a.id) ? giacenza.get(a.id) : null,
    forn: a.fornitore_id, prov: "", iva: a.aliquote_iva ? +a.aliquote_iva.aliquota : 22,
    importato: false, anno: a.anno_listino || "", scorta: a.scorta_minima
  }));
  return ARTICOLI.length;
}

// Id della sede di lavoro scelta in alto, come scritto nel database
const ID_SEDI_DB = { "CAL SMM Roma": "cal-smm-roma", "Magazzino Centrale": "magazzino-centrale" };

// Articoli: usati da Articoli, scheda carico e stampa etichette.
// Se c'è js/dati-articoli-reali.js (creato da strumenti/importa-articoli.ps1, solo su questo PC)
// si usano gli articoli veri; altrimenti, come online, questi di esempio:
// [codice, descrizione, giacenza, costo, prezzo, barcode, indice fornitore]
const ARTICOLI = typeof ARTICOLI_REALI !== "undefined" ? ARTICOLI_REALI : [
  ["A01", "Calici", 0, 130, 163, "8030969000011", 0],
  ["A01/P", "Calice ceramica avorio", 1, 16.65, 54, "9770042735161", 0],
  ["A01/P CHIRO'", "Calice Chiro' avorio", 0, 16.39, 40, "9770042738001", 0],
  ["A0101", "Calice H17 pietra oll/met", 0, 118, 288.01, "8030969000027", 2],
  ["A0103A", "Calice \"Ultima Cena\" angelica", null, 420, 1526.8, "8030969000034", 2],
  ["A0105A", "Calice H15 argentato antica e nuova alleanza", 1, 310, 850, "8030969000058", 2],
  ["A0110/11", "Calice ceram. Tutto a tutti", 3, 25, 61, "8030969000126", 4],
  ["A0110/12", "Calice ceram. Riuniti dal risorto", 1, 27.45, 82, "8030969134181", 4],
  ["A0110/14", "Calice ceram. H16/DM9,5 cm gioia", 3, 30.6, 90, "8030969172953", 4],
  ["A0110/15", "Calice ceram. pane e vino", 2, 27.45, 82, "8030969741173", 4],
  ["B0201", "Pisside dorata con coperchio", 5, 95, 210, "8030969200015", 2],
  ["B0202", "Patena argentata D16", -1, 38, 89, "8030969200022", 2],
  ["C1001", "Stola ricamata bianca", 12, 22.5, 59, "8030969300012", 1],
  ["C1002", "Stola ricamata viola", 8, 22.5, 59, "8030969300029", 1],
  ["C2001", "Casula in seta avorio", 2, 180, 420, "8030969310011", 6],
  ["D0501", "Rosario in legno d'ulivo", 46, 1.9, 6.5, "8030969400019", 5],
  ["D0502", "Rosario argento 925", 4, 38, 95, "8030969400026", 2],
  ["E0101", "Candela pasquale decorata 2026", 0, 24, 58, "8030969500013", 5],
  ["E0102", "Ceri votivi conf. 50 pz", 30, 9.8, 22, "8030969500020", 8],
  ["F0001", "Libro preghiere edizione tascabile", 25, 4.2, 9.9, "9788830700019", 3]
].map(([codice, descr, giac, costo, prezzo, barcode, forn], i) => ({
  codice, descr: descr.toUpperCase(), giac, costo, prezzo, barcode, forn,
  prov: "Magazzino Centrale", iva: codice.startsWith("F") ? 4 : 22,
  importato: i % 3 === 0, anno: i % 4 === 0 ? 2025 : 2026
}));
