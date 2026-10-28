// Carta intestata dei documenti stampati (carichi, ordini…): righe in alto a sinistra per ogni sede, piè di pagina comune.
// Come nella stampa del gestionale attuale. Una sede che non è qui stampa solo il suo nome.
const ENTE = "Provincia Italiana Pie Discepole del Divin Maestro";
const INTESTAZIONI = {
  "CAL SMM Roma": [ENTE, "APOSTOLATO LITURGICO SMM ROMA", "Largo Brancaccio, 57", "00184 Roma (RM)", "Telefono: 06.48.14.794"],
  "CAL Roma per Estero": [ENTE, "APOSTOLATO LITURGICO ROMA PER ESTERO", "Largo Brancaccio, 57", "00184 Roma (RM)", "Telefono: 06.656.86.355"]
};
const PIE_DI_PAGINA = [
  "Provincia Italiana della Congregazione delle Pie Discepole del Divin Maestro",
  "Largo Brancaccio, 57",
  "Tel. 06.65.68.62.22",
  "C.C.I.A.A. Roma n. 359210 - Cod. Fiscale 0046876052"
];
const intestazioneSede = nome => INTESTAZIONI[nome] || [ENTE, nome.toUpperCase()];
