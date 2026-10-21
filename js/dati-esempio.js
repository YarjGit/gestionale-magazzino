// Dati inventati per il prototipo: verranno sostituiti dal database vero.
const FORNITORI = [
  "Arredi Sacri Esempio SNC",
  "Tessuti Liturgici Esempio SRL",
  "Oreficeria Sacra Esempio",
  "Editrice Esempio",
  "Ceramiche Artistiche Esempio",
  "Candele Esempio & C.",
  "Ricami d'Arte Esempio SRLS",
  "Cantina Vini da Messa Esempio",
  "Cereria Esempio SPA"
];

const CLIENTI = [
  "Parrocchia San Giuseppe Esempio",
  "Istituto Religioso Esempio",
  "Ospedale Esempio - Cappella",
  "Cappella Presidio Esempio",
  "Economato Esempio",
  "Mario Bianchi"
];

// Le sedi come controparte (trasferimenti), con il loro colore
const SEDI_CP = SEDI.map(s => ({ nome: s.nome, colore: s.colore }));

// Indice di una sede in SEDI_CP
const sede = nome => SEDI_CP.findIndex(s => s.nome === nome);
