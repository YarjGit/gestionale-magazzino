// Barcode veri, leggibili dalla pistola laser.
// barcodeSvg(codice) usa EAN-13 se il codice è un EAN-13 valido, altrimenti Code 128 (legge qualsiasi testo).
// eanValido(codice) controlla le 13 cifre e la cifra di controllo.

const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
// Prima cifra → quale tabella (L o G) usare per le 6 cifre di sinistra
const EAN_PARITA = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

function cifraControlloEan(dodici) {
  const s = [...dodici].reduce((t, c, i) => t + (+c) * (i % 2 ? 3 : 1), 0);
  return String((10 - s % 10) % 10);
}

function eanValido(codice) {
  return /^\d{13}$/.test(codice) && cifraControlloEan(codice.slice(0, 12)) === codice[12];
}

// Restituisce un <svg> con le barre; con un codice non valido mostra un avviso al posto delle barre
function ean13Svg(codice, altezza = 40) {
  if (!eanValido(codice)) {
    return `<svg viewBox="0 0 95 ${altezza}" preserveAspectRatio="none"><rect width="95" height="${altezza}" fill="#fde4e4"/>` +
      `<text x="47.5" y="${altezza / 2 + 3}" text-anchor="middle" font-size="8" fill="#c62828">barcode non valido</text></svg>`;
  }
  const parita = EAN_PARITA[+codice[0]];
  let bit = "101";
  for (let i = 1; i <= 6; i++) bit += (parita[i - 1] === "L" ? EAN_L : EAN_G)[+codice[i]];
  bit += "01010";
  for (let i = 7; i <= 12; i++) bit += EAN_R[+codice[i]];
  bit += "101";
  let barre = "";
  for (let i = 0; i < bit.length; i++) if (bit[i] === "1") barre += `M${i} 0h1v${altezza}h-1z`;
  // margini bianchi di 9 moduli per lato: servono alla pistola per leggere
  return `<svg viewBox="-9 0 113 ${altezza}" preserveAspectRatio="none" shape-rendering="crispEdges"><path d="${barre}" fill="#000"/></svg>`;
}

// Code 128: larghezze barra/spazio dei simboli 0–105, poi lo stop
const C128 = ("212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 " +
  "123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 " +
  "111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 " +
  "231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 " +
  "141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 " +
  "124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 " +
  "311141 411131 211412 211214 211232").split(" ");
const C128_STOP = "2331112";

function code128Svg(testo, altezza = 40) {
  // Set C (coppie di cifre) se il testo è numerico e di lunghezza pari, altrimenti set B
  const numericoPari = /^\d+$/.test(testo) && testo.length % 2 === 0;
  const valori = numericoPari
    ? [105].concat(testo.match(/\d\d/g).map(Number))
    : [104].concat([...testo].map(c => c.charCodeAt(0) - 32));
  const controllo = valori.reduce((s, v, i) => s + v * (i || 1), 0) % 103;
  const larghezze = valori.concat(controllo).map(v => C128[v]).join("") + C128_STOP;
  let x = 0, barre = "";
  [...larghezze].forEach((w, i) => {
    if (i % 2 === 0) barre += `M${x} 0h${w}v${altezza}h-${w}z`;
    x += +w;
  });
  // margini bianchi di 10 moduli per lato
  return `<svg viewBox="-10 0 ${x + 20} ${altezza}" preserveAspectRatio="none" shape-rendering="crispEdges"><path d="${barre}" fill="#000"/></svg>`;
}

function barcodeSvg(codice, altezza = 40) {
  return eanValido(codice) ? ean13Svg(codice, altezza) : code128Svg(codice, altezza);
}

function tipoBarcode(codice) {
  return eanValido(codice) ? "EAN-13" : "Code 128";
}
