// Pagina elenco movimenti riutilizzabile (carichi, ordini, trasferimenti…).
// La pagina ha <body data-page="..." data-top="elenco"> e un <main class="content"> vuoto,
// carica sedi.js, layout.js, elenco.js e poi chiama avviaElenco({...}).
//
// Configurazione:
//   titolo, nuovo          titolo pagina e testo del pulsante "Nuovo …"
//   stati                  [{ nome, plurale, colore, icona }]
//   statiBarrati           stati mostrati in rosso e barrati
//   statiValidazione       stati mostrati quando "Validazione" è attivo
//   controparte            { filtro, elenco } es. Fornitore / Provenienza; facoltativa.
//                          Con più filtri: { filtri: [{ label, tipo }], elenco: [{ nome, tipo }] }
//   colonne                elenco di colonne (vedi COL qui sotto)
//   dati                   righe; campi usati da filtri e totali: id, stato, data, cp, lab, tot, nArt
//   csv                    nome del file esportato
//   dettaglio              pagina della scheda (es. "carico.html"): la riga si apre con ?id=…
//   senzaModifica         nasconde la matita di modifica (es. riallineamenti)
//   nuovoIcona             disegno svg diverso per il pulsante "Nuovo …"; senza "nuovo" il pulsante sparisce
//   filtriExtra            [{ id, label, campo, opzioni }] tendine di filtro in più
//   nota                   testo (HTML) mostrato in un riquadro sotto il titolo, per spiegare come funziona la pagina
// Restituisce { aggiungi(righe) } per mettere in cima i movimenti letti dal database.

// Stati dei movimenti: colore della striscia, dell'etichetta e della scheda in alto
const STATO = {
  definitivo:  { nome: "Definitivo",  plurale: "Definitivi",  colore: "#18a058", icona: "✔" },
  provvisorio: { nome: "Provvisorio", plurale: "Provvisori",  colore: "#e58a00", icona: "◷" },
  riordino:    { nome: "Riordino",    plurale: "Riordini",    colore: "#7c4dff", icona: "↻" },
  evaso:       { nome: "Evaso",       plurale: "Evasi",       colore: "#64748b", icona: "■" },
  annullato:   { nome: "Annullato",   plurale: "Annullati",   colore: "#c62828", icona: "✕" },
  // trasferimenti visti dalla sede che riceve: la merce entra in giacenza solo con "Conferma ricevuto"
  daRicevere:  { nome: "Da ricevere", plurale: "Da ricevere", colore: "#0891b2", icona: "📦" },
  ricevuto:    { nome: "Ricevuto",    plurale: "Ricevuti",    colore: "#18a058", icona: "✔" }
};

// Tipi di movimento: E = entrata in magazzino, U = uscita, R = rettifica
const TIPI_MOVIMENTO = {
  "Carico da Fornitore": "E", "Ordine a Fornitore": "E", "Trasferimento da Filiale": "E",
  "Reso da Cliente": "E", "Aumento Giacenza": "E", "Altro Carico": "E",
  "Vendite Giornaliere": "U", "Scarico a Cliente": "U", "Ordine da Cliente": "U",
  "Reso a Fornitore": "U", "Trasferimento a Filiale": "U", "Preventivo": "U",
  "Diminuzione Giacenza": "U", "Altro Scarico": "U", "Riallineamento": "R", "Giacenza iniziale": "E"
};

const dataIt = iso => iso ? iso.split("-").reverse().join("/") : "";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Colonne pronte da usare nelle pagine
const COL = {
  numero: (t = "Numero / Doc.") => ({
    // i movimenti veri (dal database) vengono prima di quelli di esempio
    k: "numero", t, sort: r => r.chiave ? 1e9 + r.id : r.id,
    html: r => `<td class="num-mov">${r.prot ? `<span class="id">${r.prot}</span><span class="sec">#${r.id}</span>` : `<span class="id">#${r.id}</span>`}${r.tag ? `<span class="tag" style="background:${r.tag.colore}22;color:${r.tag.colore}">${esc(r.tag.testo)}</span>` : ""}${r.doc ? `<span class="doc">${esc(r.doc)}${r.dataDoc ? ` del ${dataIt(r.dataDoc)}` : ""}</span>` : ""}</td>`,
    csv: r => [r.prot || "", r.id, r.doc || "", dataIt(r.dataDoc)], csvT: ["Protocollo", "Movimento", "Documento", "Data doc."]
  }),
  stato: () => ({ k: "stato", t: "Stato", sort: r => r.stato, html: (r, st) => `<td><span class="pill" style="background:${st.colore}1f;color:${st.colore}">${st.icona} ${r.stato}</span></td>`, csv: r => [r.stato], csvT: ["Stato"] }),
  // Data con il giorno della settimana, usata come identificativo (es. vendite del giorno)
  giorno: (k, t) => ({
    k, t, sort: r => r[k],
    html: r => {
      const g = new Date(r[k] + "T12:00:00").toLocaleDateString("it-IT", { weekday: "short" });
      return `<td class="num-mov"><span class="id">${dataIt(r[k])}</span><span class="sec">${g}</span></td>`;
    },
    csv: r => [dataIt(r[k])], csvT: [t]
  }),
  data: (k, t) => ({ k, t, sort: r => r[k] || "", html: r => `<td>${dataIt(r[k])}</td>`, csv: r => [dataIt(r[k])], csvT: [t] }),
  controparte: (t, larg = 200) => ({
    k: "cp", t, sort: r => r.cpNome,
    html: r => `<td><div class="testo-lungo" style="max-width:${larg}px" title="${esc(r.cpNome)}">${r.cpColore ? `<span class="pallino" style="background:${r.cpColore}"></span>` : ""}${esc(r.cpNome)}</div></td>`,
    csv: r => [r.cpNome], csvT: [t]
  }),
  testo: (k, t, larg = 120) => ({ k, t, sort: r => r[k] || "", html: r => `<td><div class="testo-medio" style="max-width:${larg}px" title="${esc(r[k])}">${esc(r[k])}</div></td>`, csv: r => [r[k] || ""], csvT: [t] }),
  euro: (k, t, grassetto) => ({ k, t, num: true, sort: r => r[k], html: r => `<td class="num">${grassetto ? `<b>${numero(r[k])}</b>` : numero(r[k])}</td>`, csv: r => [numero(r[k])], csvT: [t] }),
  // Tipo di movimento con freccia: entrata (verde) o uscita (rossa), r.tipo deve essere in TIPI_MOVIMENTO
  tipo: (t = "Tipo") => ({
    k: "tipo", t, sort: r => r.tipo,
    html: r => {
      const [cls, freccia] = { E: ["entrata", "↓"], U: ["uscita", "↑"], R: ["rettifica", "⇅"] }[TIPI_MOVIMENTO[r.tipo]];
      return `<td><span class="tipo-mov ${cls}" title="${cls}">${freccia}</span>${r.tipo}</td>`;
    },
    csv: r => [r.tipo], csvT: [t]
  }),
  // Quantità con segno: + verde (pezzi aggiunti), − rosso (pezzi tolti)
  differenza: (k, t) => ({
    k, t, num: true, sort: r => r[k],
    html: r => `<td class="num"><span class="diff ${r[k] > 0 ? "piu" : r[k] < 0 ? "meno" : ""}">${r[k] > 0 ? "+" : r[k] < 0 ? "−" : ""}${Math.abs(r[k])}</span></td>`,
    csv: r => [r[k]], csvT: [t]
  }),
  intero: (k, t) => ({ k, t, num: true, sort: r => r[k], html: r => `<td class="num">${r[k]}</td>`, csv: r => [r[k]], csvT: [t] }),
  // Avanzamento ricevuto / ordinato (es. evasione ordini)
  avanzamento: (k, t, totK) => ({
    k, t, sort: r => r[totK] ? r[k] / r[totK] : 0,
    html: r => {
      const p = r[totK] ? Math.round(r[k] / r[totK] * 100) : 0;
      return `<td><div class="avanz" title="${r[k]} di ${r[totK]} pezzi"><div class="bar"><span style="width:${p}%"></span></div><small>${p}%</small></div></td>`;
    },
    csv: r => [`${r[k]}/${r[totK]}`], csvT: [t]
  })
};

function avviaElenco(cfg) {
  const $ = id => document.getElementById(id);
  const statoDi = nome => cfg.stati.find(s => s.nome === nome);
  // Controparte facoltativa: Aumento Giacenza, ad esempio, non ha né cliente né fornitore
  const cp = cfg.controparte;
  // Le righe dal database arrivano già con cpNome (e con url e chiave: vedi aggiungi() in fondo)
  const prepara = r => {
    if (r.cpNome != null) return;
    const c = cp && r.cp != null ? cp.elenco[r.cp] : "";
    r.cpNome = typeof c === "string" ? c : c.nome;
    r.cpColore = typeof c === "string" ? null : c.colore;
  };
  cfg.dati.forEach(prepara);

  // Uno o più filtri sulla controparte (es. Altri Carichi: Fornitore e Cliente).
  // Ogni filtro mostra solo le voci dell'elenco con quel tipo.
  const nomeCp = c => typeof c === "string" ? c : c.nome;
  const filtriCp = !cp ? [] : (cp.filtri || [{ label: cp.filtro }]).map(f => ({
    label: f.label,
    indici: cp.elenco.map((c, i) => i).filter(i => !f.tipo || cp.elenco[i].tipo === f.tipo)
  }));

  // Tendine di filtro in più, specifiche della pagina (es. tipo di movimento)
  const extra = cfg.filtriExtra || [];

  // ---------- Struttura della pagina ----------
  document.querySelector("main.content").innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">${cfg.titolo}</h1>
        <div class="crumbs">
          <a href="dashboard.html"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z"/></svg></a>
          <span>-</span><span>Movimenti</span><span>-</span><span>${cfg.titolo}</span>
        </div>
      </div>
      <div class="tabs" id="tabs"></div>
    </div>
    ${cfg.nota ? `<div class="nota-elenco">${cfg.nota}</div>` : ""}

    <section class="panel filtri" id="filtri">
      <div class="filtri-head" id="filtriHead">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18l-7 9v6l-4 2v-8z"/></svg>
        <h2>Filtri di ricerca</h2>
        <span class="badge" id="filtriAttivi" hidden></span>
        <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      <div class="filtri-body">
        <div class="grid-filtri">
          <div class="f c3"><label for="fLab">Laboratorio</label><select id="fLab"><option value="">Tutti</option></select></div>
          <div class="f c2"><label for="fAnno">Anno comp.</label><input id="fAnno" type="number" value="2026"></div>
          <div class="f c4"><label for="fArt">Articolo</label><select id="fArt"><option value="">Tutti</option><option>Casula in seta</option><option>Stola ricamata</option><option>Calice dorato</option><option>Rosario in legno</option></select></div>
          <div class="f c3"><label for="fDescr">Descr. articolo</label><input id="fDescr" type="text" placeholder="Contiene…"></div>
          ${filtriCp.map((f, i) => `<div class="f c4"><label for="fCp${i}">${f.label}</label><select id="fCp${i}"><option value="">Tutti</option></select></div>`).join("")}
          <div class="f c2"><label for="fDal">Dal</label><input id="fDal" type="date"></div>
          <div class="f c2"><label for="fAl">Al</label><input id="fAl" type="date"></div>
          <div class="f c2"><label for="fStato">Stato</label><select id="fStato"><option value="">Tutti</option></select></div>
          ${extra.map(f => `<div class="f c3"><label for="${f.id}">${f.label}</label><select id="${f.id}"><option value="">Tutti</option>${f.opzioni.map(o => `<option>${esc(o)}</option>`).join("")}</select></div>`).join("")}
          <div class="f c2"><label for="fCodDa">Codice da – a</label>
            <div class="coppia"><input id="fCodDa" type="text" placeholder="da" aria-label="Codice da"><input id="fCodA" type="text" placeholder="a" aria-label="Codice a"></div>
          </div>
        </div>
        <div class="filtri-azioni"><button class="btn btn-ghost" id="azzera">Azzera filtri</button></div>
      </div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <div class="tool-group">
          <button title="Aggiorna" id="aggiorna"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg></button>
          <button title="Esporta in Excel (CSV)" id="esporta"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13l6 6M15 13l-6 6"/></svg></button>
        </div>
        <div class="colonne-wrap" id="colonneWrap">
          <button class="btn btn-light" id="colonneBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            Colonne
          </button>
          <div class="colonne-menu" id="colonneMenu"></div>
        </div>
        <div class="cerca">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <input id="cerca" type="search" placeholder="Cerca per numero, ${filtriCp.map(f => f.label.toLowerCase() + ", ").join("")}causale…">
        </div>
      </div>
      <div class="table-wrap">
        <table><thead><tr id="intestazione"></tr></thead><tbody id="righe"></tbody></table>
      </div>
      <div class="piede">
        <div class="totali" id="totali"></div>
        <div class="pagine">
          <span>Righe</span>
          <select id="perPagina"><option>10</option><option selected>25</option><option>50</option></select>
          <span id="paginaInfo"></span>
          <button id="prec" aria-label="Pagina precedente">‹</button>
          <button id="succ" aria-label="Pagina successiva">›</button>
        </div>
      </div>
    </section>`;

  const rowMenu = document.createElement("div");
  rowMenu.className = "row-menu";
  rowMenu.innerHTML = (cfg.azioniRiga || ["Modifica", "Stampa etichette", "Stampa documento", "Duplica"])
    .map(a => `<button data-az="${a}">${a}</button>`).join("") +
    '<button data-az="Annulla" class="danger">Annulla movimento</button>';
  document.body.appendChild(rowMenu);

  $("btnCrea").lastChild.textContent = " " + (cfg.nuovo || "");
  if (cfg.nuovoIcona) $("btnCrea").querySelector("svg").innerHTML = cfg.nuovoIcona;
  if (!cfg.nuovo) $("btnCrea").hidden = true;
  document.title = `${cfg.titolo} – Gestionale Magazzino`;

  // Tendine dei filtri
  filtriCp.forEach((f, n) => f.indici.forEach(i =>
    $(`fCp${n}`).insertAdjacentHTML("beforeend", `<option value="${i}">${esc(nomeCp(cp.elenco[i]))}</option>`)));
  cfg.stati.forEach(s => $("fStato").insertAdjacentHTML("beforeend", `<option>${s.nome}</option>`));
  SEDI.filter(s => s.gruppo === "Laboratori e magazzino").forEach(s =>
    $("fLab").insertAdjacentHTML("beforeend", `<option>${s.nome}</option>`));

  // ---------- Stato della pagina ----------
  const COLONNE = cfg.colonne;
  const visibili = new Set(COLONNE.map(c => c.k));
  let tabStato = "";
  let ordine = { k: COLONNE[0].k, dir: -1 };
  let pagina = 1;
  const ID_CP = filtriCp.map((f, i) => `fCp${i}`);
  const ID_EXTRA = extra.map(f => f.id);
  const CAMPI_FILTRO = ["fLab", "fArt", "fDescr", ...ID_CP, "fDal", "fAl", "fStato", ...ID_EXTRA, "fCodDa", "fCodA"];

  // Ricerca: ogni parola scritta deve comparire (anche a metà, in qualsiasi ordine, accenti ignorati).
  // Es. "cal" trova tutti i movimenti di Calandrini; "cal commissione" solo quelli con "commissione" nella causale.
  const senzaAccenti = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const paroleCerca = () => senzaAccenti($("cerca").value).split(/\s+/).filter(Boolean);
  // Evidenzia in giallo le parole cercate nel testo delle celle (non tocca pulsanti e attributi)
  function evidenzia(contenitore, parole) {
    if (!parole.length) return;
    const re = new RegExp(parole.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
    const giro = document.createTreeWalker(contenitore, NodeFilter.SHOW_TEXT);
    const nodi = [];
    while (giro.nextNode()) nodi.push(giro.currentNode);
    nodi.forEach(n => {
      // il confronto si fa sul testo senza accenti, che ha la stessa lunghezza solo se non ci sono lettere accentate
      const piatto = senzaAccenti(n.data);
      if (piatto.length !== n.data.length || !re.test(piatto)) return;
      re.lastIndex = 0;
      const pezzi = document.createDocumentFragment();
      let da = 0;
      piatto.replace(re, (m, i) => {
        pezzi.append(n.data.slice(da, i));
        const mark = document.createElement("mark");
        mark.className = "trovato";
        mark.textContent = n.data.slice(i, i + m.length);
        pezzi.append(mark);
        da = i + m.length;
      });
      pezzi.append(n.data.slice(da));
      n.replaceWith(pezzi);
    });
  }

  function filtra() {
    const parole = paroleCerca();
    const anno = $("fAnno").value;
    return cfg.dati.filter(r => {
      if (tabStato && r.stato !== tabStato) return false;
      if ($("soloValidare").checked && !cfg.statiValidazione.includes(r.stato)) return false;
      if (anno && !r.data.startsWith(anno)) return false;
      if ($("fLab").value && r.lab !== $("fLab").value) return false;
      if (ID_CP.some(id => $(id).value !== "" && r.cp !== +$(id).value)) return false;
      if (extra.some(f => $(f.id).value && r[f.campo] !== $(f.id).value)) return false;
      if ($("fStato").value && r.stato !== $("fStato").value) return false;
      if ($("fDal").value && r.data < $("fDal").value) return false;
      if ($("fAl").value && r.data > $("fAl").value) return false;
      if (parole.length) {
        const testo = senzaAccenti([`#${r.id}`, r.prot, r.doc, r.cpNome, r.causale, r.stato, r.tag && r.tag.testo].join(" "));
        if (!parole.every(p => testo.includes(p))) return false;
      }
      return true;
    });
  }

  function disegna() {
    const n = CAMPI_FILTRO.filter(id => $(id).value).length;
    $("filtriAttivi").hidden = !n;
    $("filtriAttivi").textContent = n === 1 ? "1 attivo" : `${n} attivi`;

    const base = cfg.dati.filter(r => !$("fAnno").value || r.data.startsWith($("fAnno").value));
    // Con un solo stato (es. Vendite Giornaliere) le schede non servono
    $("tabs").hidden = cfg.stati.length < 2;
    $("tabs").innerHTML = [{ nome: "", plurale: "Tutti" }].concat(cfg.stati).map(s =>
      `<button class="tab${s.nome === tabStato ? " active" : ""}" data-s="${s.nome}">${s.colore ? `<span class="dot" style="background:${s.colore}"></span>` : ""}${s.plurale}<span class="n">${base.filter(r => !s.nome || r.stato === s.nome).length}</span></button>`).join("");

    $("intestazione").innerHTML = '<th style="width:4px;padding:0"></th><th style="width:70px"></th>' +
      COLONNE.filter(c => visibili.has(c.k)).map(c => {
        const cls = ["sort", c.num ? "num" : "", ordine.k === c.k ? (ordine.dir > 0 ? "asc" : "desc") : ""].join(" ");
        const freccia = ordine.k === c.k ? (ordine.dir > 0 ? "▲" : "▼") : "▾";
        return `<th class="${cls}" data-k="${c.k}">${c.t}<span class="freccia">${freccia}</span></th>`;
      }).join("");

    const col = COLONNE.find(c => c.k === ordine.k);
    const righe = filtra().sort((a, b) => {
      const x = col.sort(a), y = col.sort(b);
      return (x > y ? 1 : x < y ? -1 : 0) * ordine.dir;
    });

    const per = +$("perPagina").value;
    const pagine = Math.max(1, Math.ceil(righe.length / per));
    pagina = Math.min(pagina, pagine);

    $("righe").innerHTML = righe.length ? righe.slice((pagina - 1) * per, pagina * per).map(r => {
      const st = statoDi(r.stato);
      return `<tr class="${cfg.statiBarrati.includes(r.stato) ? "barrato" : ""}${cfg.dettaglio || r.url ? " cliccabile" : ""}" data-id="${r.chiave || r.id}">
        <td class="stato-bar"><span style="background:${st.colore}"></span></td>
        <td><div class="azioni">
          ${cfg.senzaModifica ? "" : `<button class="icon-btn" title="Modifica" data-az="Modifica"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>`}
          <button class="icon-btn altro" title="Altre azioni"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>
        </div></td>
        ${COLONNE.filter(c => visibili.has(c.k)).map(c => c.html(r, st)).join("")}
      </tr>`;
    }).join("") : `<tr><td colspan="${2 + visibili.size}"><div class="vuoto">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-5 9 5v11H3z"/><path d="M9 20v-6h6v6"/></svg>
        <b>${cfg.dati.length ? "Nessun movimento con questi filtri" : `Ancora nessun movimento in ${cfg.titolo}`}</b>
        <span>${cfg.dati.length ? "Prova a cambiare o azzerare i filtri." : `Usa "${cfg.nuovo}" in alto per registrare il primo.`}</span>
      </div></td></tr>`;

    $("righe").querySelectorAll("td:not(:nth-child(-n+2))").forEach(td => evidenzia(td, paroleCerca()));

    const validi = righe.filter(r => !cfg.statiBarrati.includes(r.stato));
    $("totali").innerHTML = `
      <span>Movimenti: <b>${righe.length}</b></span>
      <span>Pezzi: <b>${validi.reduce((s, r) => s + r.nArt, 0)}</b></span>
      <span>Totale: <b>${euro(validi.reduce((s, r) => s + r.tot, 0))}</b></span>`;

    $("paginaInfo").textContent = `Pagina ${pagina} di ${pagine}`;
    $("prec").disabled = pagina <= 1;
    $("succ").disabled = pagina >= pagine;
  }

  // ---------- Eventi ----------
  $("tabs").onclick = e => {
    const b = e.target.closest(".tab");
    if (!b) return;
    tabStato = b.dataset.s;
    pagina = 1;
    disegna();
  };
  $("intestazione").onclick = e => {
    const th = e.target.closest("th.sort");
    if (!th) return;
    ordine = { k: th.dataset.k, dir: ordine.k === th.dataset.k ? -ordine.dir : 1 };
    disegna();
  };
  ["cerca", "fDescr", "fCodDa", "fCodA", "fAnno"].forEach(id => $(id).addEventListener("input", () => { pagina = 1; disegna(); }));
  ["fLab", "fArt", ...ID_CP, "fDal", "fAl", "fStato", ...ID_EXTRA, "perPagina", "soloValidare"]
    .forEach(id => $(id).addEventListener("change", () => { pagina = 1; disegna(); }));
  // "Record attuali": significato da chiarire, per ora non filtra
  $("recordAttuali").addEventListener("change", () => avviso("Record attuali: funzione da definire insieme"));
  $("azzera").onclick = () => { CAMPI_FILTRO.forEach(id => $(id).value = ""); $("fAnno").value = "2026"; disegna(); };
  $("filtriHead").onclick = () => $("filtri").classList.toggle("chiusi");
  $("prec").onclick = () => { pagina--; disegna(); };
  $("succ").onclick = () => { pagina++; disegna(); };
  $("aggiorna").onclick = () => { disegna(); avviso("Elenco aggiornato"); };

  // Esporta le righe filtrate in CSV (si apre con Excel)
  $("esporta").onclick = () => {
    const testa = COLONNE.flatMap(c => c.csvT);
    const csv = [testa].concat(filtra().map(r => COLONNE.flatMap(c => c.csv(r))))
      .map(riga => riga.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${cfg.csv}.csv`;
    a.click();
  };

  // Scelta colonne
  $("colonneMenu").innerHTML = COLONNE.map(c => `<label><input type="checkbox" data-k="${c.k}" checked> ${c.t}</label>`).join("");
  $("colonneMenu").onchange = e => {
    if (e.target.checked) visibili.add(e.target.dataset.k); else visibili.delete(e.target.dataset.k);
    disegna();
  };
  $("colonneBtn").onclick = e => { e.stopPropagation(); $("colonneWrap").classList.toggle("open"); };
  $("colonneMenu").onclick = e => e.stopPropagation();

  // Menu azioni della riga
  let rigaMenu = null;
  // Con cfg.dettaglio la riga intera è cliccabile e apre la scheda del movimento
  const apri = id => {
    const r = cfg.dati.find(x => String(x.chiave || x.id) === String(id));
    if (r && r.url) location.href = r.url;
    else if (cfg.dettaglio) location.href = `${cfg.dettaglio}?id=${id}`;
    else avviso(`Modifica #${id}: schermata da costruire`);
  };
  $("righe").onclick = e => {
    const btn = e.target.closest(".icon-btn");
    const tr = e.target.closest("tr[data-id]");
    // senza pagina di dettaglio comune (es. Tutti i Movimenti) si apre la riga che ha il suo indirizzo (movimenti del database)
    if (!btn) { if (tr && (cfg.dettaglio || (cfg.dati.find(x => String(x.chiave || x.id) === tr.dataset.id) || {}).url)) apri(tr.dataset.id); return; }
    e.stopPropagation();
    const id = btn.closest("tr").dataset.id;
    if (btn.dataset.az) { apri(id); return; }
    rigaMenu = id;
    const box = btn.getBoundingClientRect();
    rowMenu.classList.add("show");
    rowMenu.style.top = Math.min(box.bottom + 4, innerHeight - rowMenu.offsetHeight - 8) + "px";
    rowMenu.style.left = Math.min(box.left, innerWidth - rowMenu.offsetWidth - 8) + "px";
  };
  rowMenu.onclick = e => {
    const b = e.target.closest("button");
    if (b) avviso(`${b.dataset.az} #${rigaMenu}: da definire insieme`);
    rowMenu.classList.remove("show");
  };
  document.addEventListener("click", () => { rowMenu.classList.remove("show"); $("colonneWrap").classList.remove("open"); });
  window.addEventListener("scroll", () => rowMenu.classList.remove("show"), true);

  $("btnEtichette").onclick = () => cfg.paginaEtichette ? location.href = cfg.paginaEtichette : avviso("Stampa etichette: la definiamo insieme");
  $("btnCrea").onclick = () => cfg.dettaglio ? location.href = `${cfg.dettaglio}?nuovo=1` : avviso(`${cfg.nuovo}: schermata da costruire`);

  disegna();

  return {
    // Movimenti veri dal database, messi in cima a quelli di esempio.
    // Ogni riga: i campi soliti + cpNome, chiave (unica, es. "db-12") e url della scheda.
    aggiungi(nuove) {
      nuove.forEach(prepara);
      cfg.dati.unshift(...nuove);
      disegna();
    }
  };
}
