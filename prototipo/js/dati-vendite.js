// Vendite giornaliere di esempio: usate dall'elenco (vendite-giornaliere.html) e dalla scheda (vendita.html).
// Un movimento per giorno: è lo scarico di magazzino del venduto (la parte fiscale resta al commercialista).
// Una giornata annullata non si cancella: resta in elenco, in rosso e barrata, e non conta nei totali.
const giornoVendite = (data, totArt, nArt, annullata) => ({
  id: +data.replace(/-/g, "") * (annullata ? 10 : 1), stato: annullata ? "Annullato" : "Definitivo", data,
  causale: `Riepilogo vendite giornaliere del ${data.split("-").reverse().join("/")}`,
  totArt, tot: totArt, nArt, lab: "Laboratori Sede Centrale"
});

const VENDITE = [
  giornoVendite("2026-10-21", 308.8, 7),
  giornoVendite("2026-10-20", 211.5, 11),
  giornoVendite("2026-10-19", 1655.6, 32),
  giornoVendite("2026-10-17", 270.5, 8),
  giornoVendite("2026-10-16", 2494.9, 74),
  giornoVendite("2026-10-15", 225, 25),
  giornoVendite("2026-10-14", 3155, 68),
  giornoVendite("2026-10-13", 225.1, 19),
  giornoVendite("2026-10-12", 1252.9, 67),
  giornoVendite("2026-10-09", 399.7, 64),
  giornoVendite("2026-10-09", 98, 4, true)
];
