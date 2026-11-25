// Carta intestata dei documenti stampati (carichi, ordini…): righe in alto a sinistra per ogni sede, piè di pagina comune.
// Come nella stampa del gestionale attuale. Una sede che non è qui stampa solo il suo nome.
const ENTE = "Provincia Italiana Pie Discepole del Divin Maestro";
const INTESTAZIONI = {
  "CAL SMM Roma": [ENTE, "APOSTOLATO LITURGICO SMM ROMA", "Largo Brancaccio, 57", "00184 Roma (RM)", "Telefono: 06.48.14.794"],
  "CAL Roma per Estero": [ENTE, "APOSTOLATO LITURGICO ROMA PER ESTERO", "Largo Brancaccio, 57", "00184 Roma (RM)", "Telefono: 06.656.86.355"],
  // indirizzo e telefono del Magazzino Centrale come nel suo fornitore (900009, database/19-indirizzi-fornitori.sql)
  "Magazzino Centrale": [ENTE, "MAGAZZINO CENTRALE", "Via Portuense, 739", "00148 Roma (RM)", "Telefono: 06.65.65.62.24"]
};
const PIE_DI_PAGINA = [
  "Provincia Italiana della Congregazione delle Pie Discepole del Divin Maestro",
  "Largo Brancaccio, 57",
  "Tel. 06.65.68.62.22",
  "C.C.I.A.A. Roma n. 359210 - Cod. Fiscale 0046876052"
];
const intestazioneSede = nome => INTESTAZIONI[nome] || [ENTE, nome.toUpperCase()];

// Destinatario completo nelle stampe (in alto a destra): nome, via, CAP città (provincia), nazione se estera,
// partita IVA, codice fiscale (se diverso), telefono, cellulare, email. x è un fornitore o un cliente del database.
function righeDestinatario(x, nome) {
  if (!x) return nome ? [nome] : [];
  const cf = x.codice_fiscale && x.codice_fiscale !== x.partita_iva ? x.codice_fiscale : "";
  return [nome || x.ragione_sociale || x.nome, x.indirizzo,
    [x.cap, x.citta, x.provincia ? `(${x.provincia})` : ""].filter(Boolean).join(" "),
    x.nazione && !/^ital/i.test(x.nazione) ? String(x.nazione).toUpperCase() : "",
    x.partita_iva ? "P.IVA: " + x.partita_iva : "", cf ? "C.F.: " + cf : "",
    x.telefono ? "Telefono: " + x.telefono : "", x.cellulare ? "Cellulare: " + x.cellulare : "",
    x.email ? "Email: " + x.email : ""].filter(Boolean);
}
// Una sede come destinatario: i dati del fornitore collegato a lei (es. MAGAZZINO CENTRALE 900009), altrimenti
// le righe della sua carta intestata senza il nome dell'ente
const destinatarioSede = (nome, fornitoreSede) => fornitoreSede ? righeDestinatario(fornitoreSede, nome.toUpperCase())
  : intestazioneSede(nome).filter(r => r !== ENTE);
