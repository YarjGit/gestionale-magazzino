// Pagina anagrafica riutilizzabile (fornitori, clienti, aliquote IVA, …): tabella semplice con
// ricerca, filtri facoltativi, schede facoltative, ordinamento, pagine ed esportazione.
// La pagina ha <body data-page="..." data-top="anagrafica"> e un <main class="content"> vuoto,
// carica sedi.js, layout.js, anagrafica.js e poi chiama avviaAnagrafica({...}).
//
// Configurazione:
//   titolo, sezione, nuovo, csv
//   colonne   [{ k, t, num, larg, link, html(r) }]  link = testo blu che apre la scheda
//   dati      righe
//   filtri    [{ id, label, campo, opzioni }] tendine sopra la tabella (facoltative)
//   tabs      [{ k, t, colore, f(r) }] schede rapide in alto a destra (facoltative)
//   chiave    campo usato per identificare la riga (default: primo campo delle colonne)
//   azioniRiga  voci del menu ⋮
//   pulsanti  [{ label }] pulsanti in più nella barra in alto
//   filtroDate  campo data (aaaa-mm-gg…) da filtrare con "Dal – Al"; senza "nuovo" il pulsante sparisce

function avviaAnagrafica(cfg) {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const filtri = cfg.filtri || [];
  const tabs = cfg.tabs || [];
  const chiave = cfg.chiave || cfg.colonne[0].k;

  document.querySelector("main.content").innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">${cfg.titolo}</h1>
        <div class="crumbs">
          <a href="dashboard.html"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z"/></svg></a>
          <span>-</span><span>${cfg.sezione}</span><span>-</span><span>${cfg.titolo}</span>
        </div>
      </div>
      <div class="tabs" id="tabs" ${tabs.length ? "" : "hidden"}></div>
    </div>
    <section class="panel">
      <div class="toolbar">
        <div class="tool-group">
          <button title="Aggiorna" id="aggiorna"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg></button>
          <button title="Esporta in Excel (CSV)" id="esporta"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13l6 6M15 13l-6 6"/></svg></button>
        </div>
        ${cfg.filtroDate ? `<div class="filtro-ana"><label for="fDal">Dal</label><input type="date" id="fDal"><label for="fAl">Al</label><input type="date" id="fAl"></div>` : ""}
        ${filtri.map(f => `<div class="filtro-ana"><label for="${f.id}">${f.label}</label><select id="${f.id}"><option value="">Tutti</option>${f.opzioni.map(o => `<option>${esc(o)}</option>`).join("")}</select></div>`).join("")}
        <div class="cerca">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <input id="cerca" type="search" placeholder="Cerca…">
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
  rowMenu.innerHTML = (cfg.azioniRiga || ["Modifica", "Duplica"]).map(a => `<button data-az="${a}">${a}</button>`).join("") +
    '<button data-az="Elimina" class="danger">Elimina</button>';
  document.body.appendChild(rowMenu);

  $("btnCrea").lastChild.textContent = " " + (cfg.nuovo || "");
  if (!cfg.nuovo) $("btnCrea").hidden = true;
  // Pulsanti in più nella barra in alto, prima di "Nuovo …" (es. "Crea gruppi mancanti")
  (cfg.pulsanti || []).forEach(p => {
    const b = document.createElement("button");
    b.className = "btn btn-light";
    b.innerHTML = p.label;
    b.onclick = () => avviso(`${p.label.replace(/<[^>]+>/g, "").trim()}: da definire insieme`);
    $("btnCrea").before(b);
  });
  document.title = `${cfg.titolo} – Gestionale Magazzino`;

  let tab = "";
  let ordine = cfg.ordine || { k: cfg.colonne[0].k, dir: 1 };
  let pagina = 1;

  const testoRiga = r => cfg.colonne.map(c => r[c.k]).join(" ").toLowerCase();
  const cella = (c, r) => {
    if (c.html) return c.html(r);
    const v = esc(r[c.k]);
    const stile = c.larg ? ` style="max-width:${c.larg}px"` : "";
    if (c.link) return `<td><a href="#" class="ana-link testo-lungo" data-az="Modifica"${stile} title="${v}">${v}</a></td>`;
    return `<td class="${c.num ? "num" : ""}"><div class="testo-medio-ana"${stile} title="${v}">${v}</div></td>`;
  };

  function filtra() {
    const q = $("cerca").value.trim().toLowerCase();
    const t = tabs.find(x => x.k === tab);
    return cfg.dati.filter(r =>
      (!t || t.f(r)) &&
      filtri.every(f => !$(f.id).value || String(r[f.campo]) === $(f.id).value) &&
      (!cfg.filtroDate || ((!$("fDal").value || r[cfg.filtroDate].slice(0, 10) >= $("fDal").value) &&
                           (!$("fAl").value || r[cfg.filtroDate].slice(0, 10) <= $("fAl").value))) &&
      (!q || testoRiga(r).includes(q)));
  }

  function disegna() {
    if (tabs.length) {
      $("tabs").innerHTML = [{ k: "", t: "Tutti", f: () => true }].concat(tabs).map(t =>
        `<button class="tab${t.k === tab ? " active" : ""}" data-k="${t.k}">${t.colore ? `<span class="dot" style="background:${t.colore}"></span>` : ""}${t.t}<span class="n">${cfg.dati.filter(t.f).length}</span></button>`).join("");
    }

    $("intestazione").innerHTML = '<th style="width:70px"></th>' + cfg.colonne.map(c => {
      const cls = ["sort", c.num ? "num" : "", ordine.k === c.k ? (ordine.dir > 0 ? "asc" : "desc") : ""].join(" ");
      const freccia = ordine.k === c.k ? (ordine.dir > 0 ? "▲" : "▼") : "▾";
      return `<th class="${cls}" data-k="${c.k}">${c.t}<span class="freccia">${freccia}</span></th>`;
    }).join("");

    const righe = filtra().sort((a, b) => {
      const x = a[ordine.k] ?? "", y = b[ordine.k] ?? "";
      return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * ordine.dir;
    });
    const per = +$("perPagina").value;
    const pagine = Math.max(1, Math.ceil(righe.length / per));
    pagina = Math.min(pagina, pagine);

    $("righe").innerHTML = righe.length ? righe.slice((pagina - 1) * per, pagina * per).map(r => `
      <tr data-id="${esc(r[chiave])}">
        <td><div class="azioni">
          <button class="icon-btn" title="Modifica" data-az="Modifica"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>
          <button class="icon-btn altro" title="Altre azioni"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>
        </div></td>
        ${cfg.colonne.map(c => cella(c, r)).join("")}
      </tr>`).join("") : `<tr><td colspan="${1 + cfg.colonne.length}"><div class="vuoto">
        <b>${cfg.dati.length ? "Nessun risultato" : `Ancora nessun elemento in ${cfg.titolo}`}</b>
        <span>${cfg.dati.length ? "Prova a cambiare ricerca o filtri." : cfg.testoVuoto || (cfg.nuovo ? `Usa "${cfg.nuovo}" in alto per aggiungere il primo.` : "")}</span>
      </div></td></tr>`;

    $("totali").innerHTML = `<span>${cfg.titolo}: <b>${righe.length}</b>${righe.length !== cfg.dati.length ? ` di ${cfg.dati.length}` : ""}</span>`;
    $("paginaInfo").textContent = `Pagina ${pagina} di ${pagine}`;
    $("prec").disabled = pagina <= 1;
    $("succ").disabled = pagina >= pagine;
  }

  // ---------- Eventi ----------
  $("tabs").onclick = e => { const b = e.target.closest(".tab"); if (b) { tab = b.dataset.k; pagina = 1; disegna(); } };
  $("intestazione").onclick = e => {
    const th = e.target.closest("th.sort");
    if (!th) return;
    ordine = { k: th.dataset.k, dir: ordine.k === th.dataset.k ? -ordine.dir : 1 };
    disegna();
  };
  $("cerca").oninput = () => { pagina = 1; disegna(); };
  filtri.forEach(f => $(f.id).onchange = () => { pagina = 1; disegna(); });
  if (cfg.filtroDate) ["fDal", "fAl"].forEach(id => $(id).onchange = () => { pagina = 1; disegna(); });
  $("perPagina").onchange = () => { pagina = 1; disegna(); };
  $("prec").onclick = () => { pagina--; disegna(); };
  $("succ").onclick = () => { pagina++; disegna(); };
  $("aggiorna").onclick = () => { disegna(); avviso("Elenco aggiornato"); };
  $("btnCrea").onclick = () => avviso(`${cfg.nuovo}: scheda da costruire`);
  ["recordAttuali", "soloValidare"].forEach(id => { if ($(id)) $(id).onchange = () => avviso("Funzione da definire insieme"); });

  $("esporta").onclick = () => {
    const csv = [cfg.colonne.map(c => c.t)].concat(filtra().map(r => cfg.colonne.map(c => r[c.k] ?? "")))
      .map(riga => riga.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${cfg.csv}.csv`;
    a.click();
  };

  let rigaMenu = null;
  $("righe").onclick = e => {
    const btn = e.target.closest(".icon-btn, .ana-link");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const id = btn.closest("tr").dataset.id;
    if (btn.dataset.az) { avviso(`Scheda "${id}": da costruire`); return; }
    rigaMenu = id;
    const box = btn.getBoundingClientRect();
    rowMenu.classList.add("show");
    rowMenu.style.top = Math.min(box.bottom + 4, innerHeight - rowMenu.offsetHeight - 8) + "px";
    rowMenu.style.left = Math.min(box.left, innerWidth - rowMenu.offsetWidth - 8) + "px";
  };
  rowMenu.onclick = e => {
    const b = e.target.closest("button");
    if (b) avviso(`${b.dataset.az} "${rigaMenu}": da definire insieme`);
    rowMenu.classList.remove("show");
  };
  document.addEventListener("click", () => rowMenu.classList.remove("show"));
  window.addEventListener("scroll", () => rowMenu.classList.remove("show"), true);

  disegna();
}
