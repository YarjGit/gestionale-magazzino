// Macro gruppi di codici del gestionale attuale (11 su 13 noti: 10 dallo screenshot, F da Gruppi di Codici)
const MACRO_GRUPPI = [
  ["A", "Vasi sacri", "#b8860b"], ["B", "Arredamento", "#8d6e63"], ["L", "Tessuti", "#1565c0"],
  ["G", "Abbigliamento", "#00838f"], ["R", "Pietà dei fedeli", "#e65100"], ["E", "Vescovi", "#7b1fa2"],
  ["N", "Passamaneria", "#ad1457"], ["D", "Varie arredi", "#607d8b"], ["O", "Filati e varie", "#546e7a"],
  ["Q", "Varie", "#43a047"], ["F", "Paramenti", "#5e35b1"]
].map(([cod, descr, colore]) => ({ cod, descr, colore }));

const macroGruppo = cod => MACRO_GRUPPI.find(m => m.cod === cod);

const letteraMacro = cod => {
  const m = macroGruppo(cod);
  return `<span class="lettera" style="background:${m.colore}">${cod}</span>`;
};
