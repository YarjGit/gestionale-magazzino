// Categorie e sottocategorie degli articoli (dal gestionale attuale; le ultime due categorie sono di esempio).
// colore: usato per il badge della lettera nelle pagine Categorie e Sottocategorie.
const CATEGORIE = [
  { cod: "A", descr: "Vasi sacri", colore: "#b8860b" },
  { cod: "B", descr: "Arredo", colore: "#8d6e63" },
  { cod: "D", descr: "Scatole per ostie", colore: "#607d8b" },
  { cod: "F", descr: "Paramenti", colore: "#7b1fa2" },
  { cod: "G", descr: "Abbigliamento", colore: "#1565c0" },
  { cod: "I", descr: "Colletti", colore: "#00838f" },
  { cod: "N", descr: "Pizzi e tramezzi", colore: "#ad1457" },
  { cod: "O", descr: "Bottoni e ganci", colore: "#546e7a" },
  { cod: "P", descr: "Prima comunione", colore: "#43a047" },
  { cod: "R", descr: "Oggetti per la preghiera", colore: "#e65100" },
  { cod: "C", descr: "Candele e ceri", colore: "#f9a825" },
  { cod: "L", descr: "Libri e editoria", colore: "#5d4037" }
];

const SOTTOCATEGORIE = [
  ["R", "Corone del rosario"], ["R", "Crocifissi"], ["R", "Icone"], ["R", "Incensieri"], ["R", "Lampade"],
  ["F", "Camici"], ["F", "Casule"], ["F", "Stole"], ["F", "Teli"], ["F", "Veli"],
  ["A", "Brocche"], ["A", "Calici"], ["A", "Ostensori"], ["A", "Pissidi"], ["A", "Patene"],
  ["B", "Leggii"], ["B", "Candelieri"],
  ["G", "Talari"], ["G", "Clergyman"],
  ["P", "Tuniche"], ["P", "Bomboniere"],
  ["C", "Ceri pasquali"], ["C", "Lumini"],
  ["L", "Libri di preghiera"]
].map(([cat, descr]) => ({ cat, cod: descr, descr }));

// Numero di articoli per categoria (esempio, verrà dal database)
const ARTICOLI_PER_CATEGORIA = { A: 142, B: 58, D: 12, F: 236, G: 87, I: 19, N: 44, O: 31, P: 66, R: 318, C: 40, L: 25 };

const categoria = cod => CATEGORIE.find(c => c.cod === cod);
