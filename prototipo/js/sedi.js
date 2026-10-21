// Elenco sedi con il colore usato nel tasto in alto e nel menu filiali.
// colore null = sede senza colore (mostrata in grigio chiaro).
const GRUPPI_SEDI = ["Negozi CAL", "Laboratori e magazzino", "Altri punti vendita"];

const SEDI = [
  { nome: "CAL Bari", colore: "#ffc0cb", gruppo: "Negozi CAL" },
  { nome: "CAL Cagliari", colore: "#ffff00", gruppo: "Negozi CAL" },
  { nome: "CAL Centrale di Zugliano", colore: "#a52a2a", gruppo: "Negozi CAL" },
  { nome: "CAL Cinisello Balsamo", colore: "#ffa500", gruppo: "Negozi CAL" },
  { nome: "CAL Firenze", colore: "#0000ff", gruppo: "Negozi CAL" },
  { nome: "CAL Milano", colore: "#00d02a", gruppo: "Negozi CAL" },
  { nome: "CAL Palermo", colore: "#40e0d0", gruppo: "Negozi CAL" },
  { nome: "CAL Roma per Estero", colore: "#eaff6a", gruppo: "Negozi CAL" },
  { nome: "CAL Sede di Roma", colore: "#2f4f4f", gruppo: "Negozi CAL" },
  { nome: "CAL SMM Roma", colore: "#d4009c", gruppo: "Negozi CAL" },
  { nome: "Magazzino Centrale", colore: "#990000", gruppo: "Laboratori e magazzino" },
  { nome: "Laboratorio Ceramiche", colore: "#808000", gruppo: "Laboratori e magazzino" },
  { nome: "Laboratori Sede Centrale", colore: null, gruppo: "Laboratori e magazzino" },
  { nome: "Laboratorio Cinisello Balsamo", colore: null, gruppo: "Laboratori e magazzino" },
  { nome: "Laboratorio Confezione Sede Centrale", colore: null, gruppo: "Laboratori e magazzino" },
  { nome: "Libreria Caliendo", colore: null, gruppo: "Altri punti vendita" },
  { nome: "Negozio Basilica Papale di San Paolo fuori le Mura - FLM", colore: null, gruppo: "Altri punti vendita" }
];

// Sedi che oggi usano il gestionale. Le altre restano pronte ma spente:
// per attivarne una basta aggiungerla qui.
const SEDI_ATTIVE = ["CAL SMM Roma", "Magazzino Centrale"];
SEDI.forEach(s => s.attiva = SEDI_ATTIVE.includes(s.nome));

// Testo bianco o scuro in base a quanto è chiaro lo sfondo
function coloreTesto(hex) {
  if (!hex) return "#1d2433";
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#1d2433" : "#ffffff";
}

// Una sede non attiva non può essere la sede di lavoro: si torna a CAL SMM Roma
function trovaSede(nome) {
  return SEDI.find(s => s.nome === nome && s.attiva) || SEDI.find(s => s.nome === "CAL SMM Roma");
}

function leggiSede() {
  try { return sessionStorage.getItem("sede"); } catch (e) { return null; }
}

function salvaSede(nome) {
  try { sessionStorage.setItem("sede", nome); } catch (e) {}
}
