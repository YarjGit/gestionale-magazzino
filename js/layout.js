// Menu laterale, barra in alto e scelta sede comuni a tutte le pagine interne.
// Ogni pagina ha <body data-page="..."> e il contenuto in <main class="content">.
// Le azioni della barra in alto specifiche della pagina vanno in <template id="top-actions">.

const ICONE = {
  dashboard: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  movimenti: '<path d="M1 4h14v12H1z"/><path d="M15 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  magazzino: '<path d="M3 9l9-5 9 5v11H3z"/><path d="M7 20v-7h10v7"/><path d="M7 16h10"/>',
  laboratori: '<path d="M8 3l-5 3 2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
  configurazione: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 10h.1a2 2 0 1 1 0 4z"/>',
  setup: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>'
};

// Voci del menu. "page" = pagina già fatta; senza page la voce è ancora da costruire.
// "futuro" = voce rimandata: resta nel menu con l'etichetta "in futuro" e il testo dell'avviso.
const MENU = [
  { id: "dashboard", label: "Dashboard", page: "dashboard" },
  { id: "movimenti", label: "Movimenti", gruppi: [
    { titolo: "Entrate", voci: [
      { label: "Carichi da Fornitori", page: "carichi-fornitori" },
      { label: "Ordini a Fornitori", page: "ordini-fornitori" },
      { label: "Trasferimenti da Filiali", page: "trasferimenti-da-filiali" },
      { label: "Resi Ricevuti da Clienti", page: "resi-da-clienti" },
      { label: "Aumento Giacenza", page: "aumento-giacenza" },
      { label: "Altri Carichi", page: "altri-carichi" }
    ] },
    { titolo: "Uscite", voci: [
      { label: "Vendite Giornaliere", page: "vendite-giornaliere" },
      { label: "Scarichi a Clienti", page: "scarichi-clienti" },
      { label: "Ordini da Clienti", page: "ordini-clienti" },
      { label: "Resi Inviati a Fornitori", page: "resi-a-fornitori" },
      { label: "Trasferimenti a Filiali", page: "trasferimenti-a-filiali" },
      { label: "Preventivi", page: "preventivi" },
      { label: "Diminuzione Giacenza", page: "diminuzione-giacenza" },
      { label: "Altri Scarichi", page: "altri-scarichi" }
    ] },
    { titolo: "Rettifiche", voci: [{ label: "Riallineamenti Giacenza", page: "riallineamenti-giacenza" }] },
    { titolo: "Riepilogo", voci: [{ label: "Tutti i Movimenti", page: "tutti-movimenti" }] }
  ] },
  { id: "magazzino", label: "Magazzino", gruppi: [
    { titolo: "Anagrafica", voci: [{ label: "Articoli", page: "articoli" }, { label: "Categorie", page: "categorie" }, { label: "Sottocategorie", page: "sottocategorie" }] },
    { titolo: "Situazione", voci: [{ label: "Giacenze", page: "giacenze" }] }
  ] },
  { id: "laboratori", label: "Laboratori", gruppi: [
    { voci: [{ label: "Laboratori", futuro: "Laboratori: per ora non serve, lo vedremo in futuro" }] }
  ] },
  { id: "configurazione", label: "Configurazione", gruppi: [
    { titolo: "Anagrafiche", voci: [
      { label: "Fornitori", page: "fornitori" },
      { label: "Clienti", page: "clienti" },
      { label: "Gruppi", page: "gruppi" }
    ] },
    { titolo: "Fiscale e pagamenti", voci: [
      { label: "Aliquote IVA", page: "aliquote-iva" },
      { label: "Coordinate Bancarie", page: "coordinate-bancarie" },
      { label: "Condizioni Pagamento", page: "condizioni-pagamento" },
      { label: "Sconti Clienti", page: "sconti-clienti" }
    ] },
    { titolo: "Documenti", voci: [
      { label: "Email Templates", page: "email-templates" },
      { label: "Contatori", page: "contatori" },
      { label: "Tipi Movimento", page: "tipi-movimento" },
      { label: "Totali Movimenti", page: "totali-movimenti" }
    ] },
    { titolo: "Logistica", voci: [
      { label: "Spedizionieri", page: "spedizionieri" },
      { label: "Casse", page: "casse" },
      { label: "Luoghi Consegna Merci", page: "luoghi-consegna" }
    ] },
    { titolo: "Stampe e codici", voci: [
      { label: "Modelli Stampa", page: "modelli-stampa" },
      { label: "Macro Gruppi di Codici", page: "macro-gruppi-codici" },
      { label: "Gruppi di Codici", page: "gruppi-codici" }
    ] }
  ] },
  { id: "setup", label: "Setup", gruppi: [
    { titolo: "Utenti", voci: [
      { label: "Attività Utenti", page: "attivita-utenti" },
      { label: "Utenti Sito", futuro: "Utenti Sito: la faremo quando collegheremo il magazzino all'e-commerce" }
    ] },
    { titolo: "Azienda", voci: [{ label: "Sedi", page: "sedi" }, { label: "App Settings", page: "app-settings" }] },
    { titolo: "Sistema", voci: [
      { label: "Background Task", page: "background-task" },
      { label: "Azioni Applicazione", page: "azioni-applicazione" },
      { label: "Firewall Rules", page: "firewall-rules" }
    ] },
    // "Controlla Traduzioni" nel gestionale attuale rimanda alla dashboard (strumento per i programmatori): non la rifacciamo
    { titolo: "Lingue", voci: [{ label: "Traduzioni", page: "traduzioni" }] }
  ] }
];

// Azioni della barra in alto comuni a tutte le pagine elenco dei movimenti
const AZIONI_ELENCO = `
  <label class="top-toggle" title="Mostra solo i movimenti da validare">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"/><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/></svg>
    <input type="checkbox" id="soloValidare"> Validazione
  </label>
  <label class="top-toggle" title="Funzione da definire">
    <input type="checkbox" id="recordAttuali" checked> Record attuali
  </label>
  <span class="spacer"></span>
  <button class="btn btn-light" id="btnEtichette">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>
    Etichette
  </button>
  <button class="btn btn-primary" id="btnCrea">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
    Nuovo</button>`;

// Azioni della barra in alto per le pagine anagrafica (Configurazione)
const AZIONI_ANAGRAFICA = `
  <label class="top-toggle" title="Funzione da definire">
    <input type="checkbox" id="soloValidare"> Validazione
  </label>
  <label class="top-toggle" title="Funzione da definire">
    <input type="checkbox" id="recordAttuali" checked> Record attuali
  </label>
  <span class="spacer"></span>
  <button class="btn btn-primary" id="btnCrea">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
    Nuovo</button>`;

const svg = (path, cls = "ico") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

function avviso(testo) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = testo;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

(function costruisciLayout() {
  const pagina = document.body.dataset.page;
  const contenuto = document.querySelector("main.content");

  // ---------- Menu laterale ----------
  const voceHtml = v => v.page
    ? `<a href="${v.page}.html"${v.page === pagina ? ' class="active"' : ""}>${v.label}</a>`
    : v.futuro
      ? `<a href="#" class="futuro" data-motivo="${v.futuro}" title="${v.futuro}">${v.label}<span class="tag-futuro">in futuro</span></a>`
      : `<a href="#" class="todo">${v.label}</a>`;

  const navHtml = MENU.map(m => {
    const aperta = m.gruppi && m.gruppi.some(g => g.voci.some(v => v.page === pagina));
    if (!m.gruppi) {
      return `<div class="nav-item"><a class="nav-link${m.page === pagina ? " active" : ""}" href="${m.page}.html" title="${m.label}">
        ${svg(ICONE[m.id])}<span class="label">${m.label}</span></a></div>`;
    }
    return `<div class="nav-item${aperta ? " open" : ""}">
      <button class="nav-link" title="${m.label}">
        ${svg(ICONE[m.id])}<span class="label">${m.label}</span>${svg('<path d="M6 9l6 6 6-6"/>', "chev")}
      </button>
      <div class="submenu">${m.gruppi.map(g =>
        (g.titolo ? `<div class="sub-group">${g.titolo}</div>` : "") + g.voci.map(voceHtml).join("")).join("")}
      </div>
    </div>`;
  }).join("");

  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  sidebar.innerHTML = `
    <div class="brand">
      <div class="brand-logo">${svg('<path d="M3 9l9-5 9 5v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M7 20v-7h10v7"/><path d="M7 16h10"/>').replace('class="ico"', 'width="20" height="20"')}</div>
      <span class="brand-name">Gestione Magazzino</span>
      <button class="collapse-btn" title="Riduci menu">«</button>
    </div>
    <nav class="nav">${navHtml}</nav>
    <div class="side-foot">Prototipo v0.3</div>`;

  const overlay = document.createElement("div");
  overlay.className = "overlay";

  // ---------- Barra in alto ----------
  const pronte = { elenco: AZIONI_ELENCO, anagrafica: AZIONI_ANAGRAFICA }[document.body.dataset.top];
  const extra = pronte ? { innerHTML: pronte } : document.getElementById("top-actions");
  const topbar = document.createElement("header");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button class="menu-btn" aria-label="Apri menu">${svg('<path d="M4 6h16M4 12h16M4 18h16"/>').replace('class="ico"', 'width="20" height="20"')}</button>
    <div class="sede-wrap">
      <button class="sede" title="Cambia sede">
        ${svg('<path d="M3 9l1-5h16l1 5"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>').replace('class="ico"', 'width="16" height="16" style="flex:none"')}
        <span id="sedeName"></span>
        ${svg('<path d="M6 9l6 6 6-6"/>', "chev").replace('class="chev"', 'class="chev" width="14" height="14"')}
      </button>
      <div class="sedi-menu">
        <input class="sedi-search" type="search" placeholder="Cerca sede…">
        <div class="sedi-grid"></div>
      </div>
    </div>
    <div class="top-actions">${extra ? extra.innerHTML : ""}</div>
    <span class="spacer"></span>
    <div class="user">
      <button class="user-btn"><span class="avatar">MR</span><span class="user-name">Mario Rossi</span></button>
      <div class="user-menu">
        <a href="#" class="todo">Profilo</a>
        <a href="#" data-azione="cambia-sede">Cambia sede</a>
        <a href="login.html">Esci</a>
      </div>
    </div>`;

  const main = document.createElement("div");
  main.className = "main";
  contenuto.parentNode.insertBefore(main, contenuto);
  main.appendChild(topbar);
  main.appendChild(contenuto);
  document.body.prepend(overlay);
  document.body.prepend(sidebar);

  // ---------- Finestra di scelta sede all'ingresso ----------
  const scelta = document.createElement("div");
  scelta.className = "modal-bg";
  scelta.innerHTML = `
    <div class="modal" role="dialog" aria-label="Scelta sede">
      <h2>Da quale sede lavori oggi?</h2>
      <p>Potrai cambiarla in qualsiasi momento dal tasto colorato in alto.</p>
      <input class="sedi-search" type="search" placeholder="Cerca sede…">
      <div class="sedi-grid"></div>
    </div>`;
  document.body.appendChild(scelta);

  // ---------- Comportamento menu ----------
  sidebar.querySelectorAll(".nav-item").forEach(item => {
    const btn = item.querySelector("button.nav-link");
    if (btn) btn.addEventListener("click", () => {
      document.body.classList.remove("mini");
      item.classList.toggle("open");
    });
  });
  sidebar.querySelector(".collapse-btn").onclick = () => document.body.classList.toggle("mini");
  topbar.querySelector(".menu-btn").onclick = () => document.body.classList.add("side-open");
  overlay.onclick = () => document.body.classList.remove("side-open");
  document.addEventListener("click", e => {
    const todo = e.target.closest("a.todo");
    if (todo) { e.preventDefault(); avviso(`"${todo.textContent.trim()}" è ancora da costruire`); }
    const futuro = e.target.closest("a.futuro");
    if (futuro) { e.preventDefault(); avviso(futuro.dataset.motivo); }
  });

  const user = topbar.querySelector(".user");
  user.querySelector(".user-btn").onclick = e => { e.stopPropagation(); user.classList.toggle("open"); };

  // ---------- Sede attiva ----------
  const sedeWrap = topbar.querySelector(".sede-wrap");
  const sedeBtn = topbar.querySelector(".sede");
  const sediMenu = topbar.querySelector(".sedi-menu");

  const mostraSede = nome => {
    const s = trovaSede(nome);
    document.getElementById("sedeName").textContent = s.nome;
    sedeBtn.style.background = s.colore || "#f1f3f7";
    sedeBtn.style.color = coloreTesto(s.colore);
    return s;
  };
  let sedeAttiva = leggiSede() ? mostraSede(leggiSede()) : null;

  const disegnaSedi = (grid, filtro) => {
    const f = (filtro || "").toLowerCase();
    const html = GRUPPI_SEDI.map(g => {
      const lista = SEDI.filter(s => s.gruppo === g && s.nome.toLowerCase().includes(f));
      if (!lista.length) return "";
      return `<div class="sedi-gruppo">${g}</div>` + lista.map(s =>
        `<button class="${s.colore ? "" : "plain"}${s === sedeAttiva ? " current" : ""}"
          style="${s.colore ? `background:${s.colore};color:${coloreTesto(s.colore)}` : ""}"
          data-nome="${s.nome}">${s.nome}</button>`).join("");
    }).join("");
    grid.innerHTML = html || '<p class="empty">Nessuna sede trovata.</p>';
  };

  const scegli = e => {
    const b = e.target.closest("button[data-nome]");
    if (!b) return;
    salvaSede(b.dataset.nome);
    sedeAttiva = mostraSede(b.dataset.nome);
    sedeWrap.classList.remove("open");
    scelta.classList.remove("show");
    document.dispatchEvent(new CustomEvent("sede-cambiata", { detail: sedeAttiva }));
  };

  [sediMenu, scelta].forEach(box => {
    const grid = box.querySelector(".sedi-grid");
    const cerca = box.querySelector(".sedi-search");
    grid.onclick = scegli;
    cerca.oninput = () => disegnaSedi(grid, cerca.value);
  });

  const apriTendina = () => {
    sedeWrap.classList.add("open");
    const cerca = sediMenu.querySelector(".sedi-search");
    cerca.value = "";
    disegnaSedi(sediMenu.querySelector(".sedi-grid"));
    cerca.focus();
  };
  sedeBtn.onclick = e => {
    e.stopPropagation();
    if (sedeWrap.classList.contains("open")) sedeWrap.classList.remove("open"); else apriTendina();
  };
  sediMenu.onclick = e => e.stopPropagation();
  user.querySelector('[data-azione="cambia-sede"]').onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    user.classList.remove("open");
    apriTendina();
  };

  document.addEventListener("click", () => { sedeWrap.classList.remove("open"); user.classList.remove("open"); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") sedeWrap.classList.remove("open"); });

  // Il login è uguale per tutti: se la sede non è ancora scelta la si chiede subito
  if (!sedeAttiva) {
    disegnaSedi(scelta.querySelector(".sedi-grid"));
    scelta.classList.add("show");
  }
})();

// Formato euro con punto delle migliaia anche sotto i 10.000
const euro = n => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" });
const numero = n => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
