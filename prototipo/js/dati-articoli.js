// Articoli di esempio: usati da Articoli e dalla stampa etichette.
// [codice, descrizione, giacenza, costo, prezzo, barcode, indice fornitore]
const ARTICOLI = [
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
