// Righe articolo delle schede movimento (Ordine a fornitore, Vendita giornaliera…), come nel gestionale attuale:
// tasto ＋ per una riga nuova in cui si cerca l'articolo, cestino, frecce per spostare, quantità con − / +,
// prezzo con ↻ (riprende quello dell'anagrafica), IVA per riga, sconto e prezzo totale.
// Sopra la tabella c'è il campo per la pistola (codice o barcode + Invio).
// Richiede dati-articoli.js (ARTICOLI, corrispondeArticolo) e layout.js (esc, numero, avviso).
//
// HTML: righeHtmlAggiungi() e righeHtmlTabella(cfg) danno i pezzi da mettere nella pagina.
// avviaRighe(cfg) li fa funzionare. cfg:
//   prezzoDi(art)       prezzo unitario proposto (costo per gli acquisti, prezzo di vendita per le vendite)
//   etichettaPrezzo     intestazione della colonna prezzo (es. "Costo", "Prezzo")
//   ivaInclusa          true se il prezzo è già IVA inclusa (vendite); altrimenti l'IVA si aggiunge al totale
//   spedita             true per avere anche la colonna Spedita (quanto è uscito davvero)
//   soloSpedita         con spedita: Ordinata resta vuota e si scrive solo Spedita (vendite giornaliere, come nel gestionale attuale)
//   nelMovimento        testo per gli avvisi, es. "nell'ordine"
//   puoAggiungere()     false blocca le aggiunte (es. manca il fornitore); la funzione avvisa da sola
//   altroFornitore(art) true se l'articolo non è del fornitore scelto (avviso arancione)
//   cambiato()          chiamata quando cambiano le righe (per totali in alto, catalogo…)
//   notaArticolo(art)   testo facoltativo accanto all'articolo e nell'avviso (es. "già in attesa dal Magazzino Centrale: 5")
//   fermaArticolo(art, n, procedi)  true = l'articolo non entra (es. già in attesa dal Magazzino Centrale): la pagina
//                       spiega perché e, se serve davvero, chiama procedi() per aggiungerlo lo stesso (la riga ha oltreAttesa)
//   giacenzaNeiSuggerimenti  true: accanto agli articoli suggeriti si vede quanti pezzi ha in giacenza la sede di lavoro
//   sedeEstera()        true se il movimento è di una sede estera: le righe partono con IVA 0%
//   limiteGiacenza      true per le vendite: non si possono scaricare più pezzi di quelli in giacenza nella sede
//                       (le righe caricate con giaScaricati: n restituiscono quei pezzi, già tolti dalla giacenza)

// Regola dell'utente: tutto al 22%, le ostie al 4%, i libri a 0% (IVA pagata dall'editore),
// le sedi estere senza IVA (0%). I codici sono quelli della tabella aliquote_iva.
const ALIQUOTE_RIGA = [["22", "22%", 22], ["04", "4% (ostie)", 4], ["0", "0% (libri)", 0], ["--", "0% (sede estera)", 0]];
const ivaDiArticolo = (art, sedeEstera) => sedeEstera ? "--" : art.iva === 4 ? "04" : art.iva === 0 ? "0" : "22";
const nomeIva = k => (ALIQUOTE_RIGA.find(a => a[0] === k) || [k, k])[1];
const percIva = k => (ALIQUOTE_RIGA.find(a => a[0] === k) || [k, k, 0])[2];

// conFornitore: aggiunge l'interruttore "anche di altri fornitori" (di solito si cercano solo gli articoli del fornitore scelto)
function righeHtmlAggiungi(conFornitore) {
  return `<div class="aggiungi-art solo-mod richiede-forn">
      <div class="f cerca-art">
        <label for="addArt">Aggiungi articolo <span class="pistola"><span class="led"></span>pronto per la pistola</span></label>
        <input id="addArt" type="text" placeholder="Spara il barcode o scrivi codice / descrizione…" autocomplete="off">
        <div class="suggerimenti" id="suggArt"></div>
      </div>
      <div class="f" style="width:90px"><label for="addQta">Quantità</label><input id="addQta" type="number" min="1" value="1" style="text-align:right"></div>
      <button class="btn btn-primary" id="addBtn">Aggiungi</button>
      ${conFornitore ? `<label class="interr" style="margin:0 0 8px" title="Di solito si cercano solo gli articoli del fornitore scelto"><span class="switch"><input type="checkbox" id="tuttiForn"><span></span></span> anche di altri fornitori</label>` : ""}
    </div>`;
}

function righeHtmlTabella(cfg) {
  return `<div class="table-wrap">
      <table>
        <thead><tr><th class="solo-mod richiede-forn" style="width:96px"><button class="btn-riga nuova" id="nuovaRiga" title="Nuova riga: cerca l'articolo scrivendo il codice">＋</button></th><th>#</th><th>Articolo</th>
          <th class="num">Ordinata</th>${cfg.spedita ? '<th class="num" title="Quanto è uscito davvero">Spedita</th>' : ""}<th class="num" title="Giacenza attuale nella sede">Giac.</th><th class="num">Anno giac.</th>
          <th class="num">${cfg.etichettaPrezzo}</th><th>IVA</th><th class="num">Sconto %</th><th class="num">Prezzo totale</th></tr></thead>
        <tbody id="righeArt"></tbody>
        <tfoot><tr><td class="solo-mod"></td><td colspan="2">Totale</td><td class="num" id="totOrd"></td>${cfg.spedita ? '<td class="num" id="totSped"></td>' : ""}<td colspan="5"></td><td class="num" id="totArt"></td></tr></tfoot>
      </table>
    </div>`;
}

function avviaRighe(cfg) {
  const $ = id => document.getElementById(id);
  const RIGHE = [];
  let ultimaAggiunta = null;
  const puo = () => !cfg.puoAggiungere || cfg.puoAggiungere();
  const estera = () => !!(cfg.sedeEstera && cfg.sedeEstera());
  const altro = art => !!(cfg.altroFornitore && cfg.altroFornitore(art));
  const num = s => +String(s).replace(/\./g, "").replace(",", ".") || 0;
  const colonne = cfg.spedita ? 11 : 10;

  // Prezzo totale della riga, sempre al centesimo. Acquisti: IVA aggiunta (3 × 18,50 al 22% = 67,71);
  // vendite: il prezzo è già IVA inclusa. Se c'è la colonna Spedita conta quella.
  const totRiga = r => {
    const pezzi = cfg.spedita ? r.sped : r.qta;
    const iva = cfg.ivaInclusa ? 1 : 1 + percIva(r.iva) / 100;
    return Math.round(pezzi * r.prezzo * (1 - (r.sconto || 0) / 100) * iva * 100) / 100;
  };
  const nuovaPos = () => RIGHE.reduce((m, x) => Math.max(m, x.pos), 0) + 1;
  const cambiato = () => { totali(); disegna(); if (cfg.cambiato) cfg.cambiato(); };
  const pezziDi = r => cfg.spedita ? r.sped : r.qta;

  // Vendite: pezzi disponibili = giacenza della sede + quelli che questa giornata aveva già scaricato
  const giaScaricati = new Map();
  const disponibili = art => art.giac + (giaScaricati.get(art.codice) || 0);
  const testoOltre = (art, pezzi) => {
    const d = disponibili(art);
    return `${art.codice}: non si possono vendere ${pezzi === 1 ? "1 pezzo" : `${pezzi} pezzi`}, in giacenza ${d <= 0 ? "non ce n'è nessuno" : d === 1 ? "ce n'è solo 1" : `ce ne sono solo ${d}`}`;
  };
  // true (con avviso rosso) se i pezzi superano la giacenza; senza giacenza nota non blocca
  function oltreGiacenza(art, pezzi) {
    if (!cfg.limiteGiacenza || art.giac == null || pezzi <= disponibili(art)) return false;
    avviso(testoOltre(art, pezzi), true);
    return true;
  }

  function totali() {
    const conArt = RIGHE.filter(r => r.articolo);
    $("totOrd").textContent = cfg.soloSpedita ? "" : conArt.reduce((s, r) => s + r.qta, 0);
    if (cfg.spedita) $("totSped").textContent = conArt.reduce((s, r) => s + r.sped, 0);
    $("totArt").textContent = numero(RIGHE.reduce((s, r) => s + r.tot, 0));
  }

  // Mette l'articolo nel movimento: se c'è già, aumenta la quantità della sua riga
  function aggiungi(art, n, { vaiAlCampo = true, silenzioso = false, forza = false } = {}) {
    let r = RIGHE.find(x => x.articolo === art);
    if (!r && !forza && cfg.fermaArticolo && cfg.fermaArticolo(art, n, () => aggiungi(art, n, { vaiAlCampo, silenzioso, forza: true }))) return false;
    if (oltreGiacenza(art, (r ? pezziDi(r) : 0) + n)) return false;
    if (r) { r.qta += n; if (cfg.spedita) r.sped += n; }
    else {
      r = { pos: nuovaPos(), qta: n, sped: n, prezzo: cfg.prezzoDi(art), sconto: 0, iva: ivaDiArticolo(art, estera()), articolo: art, oltreAttesa: forza };
      RIGHE.push(r);
    }
    r.tot = totRiga(r);
    ultimaAggiunta = r.pos;
    if (silenzioso) return;
    cambiato();
    const nota = cfg.notaArticolo && cfg.notaArticolo(art);
    avviso(`${art.codice}: ${r.qta} ${cfg.nelMovimento}` + (altro(art) ? " · attenzione: non risulta di questo fornitore" : "") + (nota ? " · " + nota : ""));
    if (vaiAlCampo) $("addArt").focus();
    return true;
  }
  // Tasto ＋: riga vuota in cui si cerca l'articolo scrivendo il codice (o sparandolo)
  function nuovaRiga() {
    if (!puo()) return;
    const r = { pos: nuovaPos(), qta: 1, sped: 1, prezzo: 0, sconto: 0, iva: "22", articolo: null, tot: 0 };
    RIGHE.push(r);
    ultimaAggiunta = r.pos;
    cambiato();
    document.querySelector(`[data-cercariga="${r.pos}"]`).focus();
  }
  function completaRiga(r, art, forza) {
    if (RIGHE.some(x => x.articolo === art)) {   // articolo già presente: la riga vuota sparisce e la quantità va sulla sua riga
      RIGHE.splice(RIGHE.indexOf(r), 1);
      aggiungi(art, r.qta, { vaiAlCampo: false });
      return;
    }
    if (oltreGiacenza(art, pezziDi(r))) return;   // la riga resta vuota: si può scegliere un altro articolo
    if (!forza && cfg.fermaArticolo && cfg.fermaArticolo(art, r.qta, () => completaRiga(r, art, true))) return;
    Object.assign(r, { articolo: art, prezzo: cfg.prezzoDi(art), iva: ivaDiArticolo(art, estera()), oltreAttesa: !!forza });
    r.tot = totRiga(r);
    cambiato();
    if (altro(art)) avviso(`${art.codice}: attenzione, non risulta di questo fornitore`);
  }

  // Ordine in cui si vedono le righe (le frecce spostano una riga dentro quest'ordine)
  const righeInOrdine = () => RIGHE.slice().sort((a, b) => $("ordinaCodice").checked
    ? (a.articolo ? a.articolo.codice : "").localeCompare(b.articolo ? b.articolo.codice : "")
    : $("nuoviInAlto").checked ? b.pos - a.pos : a.pos - b.pos);

  function disegna() {
    const mod = document.body.classList.contains("in-modifica");
    // in sola lettura i valori si vedono come testo
    const inp = (r, campo, valore, cls = "") => mod ? `<input class="num-mod ${cls}" data-campo="${campo}" data-riga="${r.pos}" value="${valore}">` : valore;
    const passo = (r, campo) => `<span class="passo"><button class="btn-riga solo-mod" data-passo="-1" data-quale="${campo}" data-riga="${r.pos}" title="Un pezzo in meno">−</button>${inp(r, campo, r[campo])}<button class="btn-riga solo-mod" data-passo="1" data-quale="${campo}" data-riga="${r.pos}" title="Un pezzo in più">+</button></span>`;
    const lista = righeInOrdine();
    const fisse = $("ordinaCodice").checked;
    $("righeArt").innerHTML = lista.length ? lista.map((r, i) => {
      const a = r.articolo;
      const comandi = `<td class="solo-mod"><div class="comandi">
          <button class="btn-riga cestino" data-togli="${r.pos}" title="Elimina riga">🗑</button>
          <div class="frecce"><button class="btn-riga" data-sposta="-1" data-riga="${r.pos}" title="Sposta su" ${fisse || !i ? "disabled" : ""}>▲</button><button class="btn-riga" data-sposta="1" data-riga="${r.pos}" title="Sposta giù" ${fisse || i === lista.length - 1 ? "disabled" : ""}>▼</button></div>
        </div></td><td style="color:var(--muted)">${r.pos}</td>`;
      if (!a) return `<tr class="lampeggia">${comandi}
        <td colspan="${colonne - 2}"><div class="cerca-riga"><input data-cercariga="${r.pos}" placeholder="Scrivi il codice o la descrizione, o spara il barcode…" autocomplete="off"><div class="suggerimenti" data-suggriga="${r.pos}"></div></div></td></tr>`;
      const fuori = mod && altro(a);
      return `<tr class="${r.pos === ultimaAggiunta ? "lampeggia" : ""}">${comandi}
        <td class="art-cella" title="Barcode ${esc(a.barcode)}"><span class="codice">${esc(a.codice)}</span><button class="apri-art solo-mod" data-cambia="${r.pos}" title="Cambia articolo">✎</button>${fuori ? '<span class="altro-forn"> · di un altro fornitore</span>' : ""}${cfg.notaArticolo && cfg.notaArticolo(a) ? `<span class="nota-art"> · ${esc(cfg.notaArticolo(a))}</span>` : ""}${r.oltreAttesa ? '<span class="tag-piu">IN PIÙ</span>' : ""}<b>${esc(a.descr)}</b></td>
        <td class="num">${cfg.soloSpedita ? '<span style="color:var(--muted)">—</span>' : passo(r, "qta")}</td>
        ${cfg.spedita ? `<td class="num">${passo(r, "sped")}</td>` : ""}
        <td class="num">${a.giac ?? "—"}</td>
        <td class="num" style="color:var(--muted)">${a.anno}</td>
        <td class="num"><span class="costo-riga">${inp(r, "prezzo", numero(r.prezzo), "largo")}<button class="btn-riga solo-mod" data-riprezzo="${r.pos}" title="Riprendi il prezzo dall'anagrafica articolo (${numero(cfg.prezzoDi(a))})">↻</button></span></td>
        <td>${mod
          ? `<select class="sel-iva${r.iva !== "22" ? " diversa" : ""}" data-campo="iva" data-riga="${r.pos}">${ALIQUOTE_RIGA.map(([k, t]) => `<option value="${k}"${k === r.iva ? " selected" : ""}>${t}</option>`).join("")}</select>`
          : `<span class="sel-iva${r.iva !== "22" ? " diversa" : ""}" style="border-color:transparent">${nomeIva(r.iva)}</span>`}</td>
        <td class="num">${inp(r, "sconto", r.sconto)}</td>
        <td class="num"><b>${numero(r.tot)}</b></td>
      </tr>`;
    }).join("") : `<tr><td colspan="${colonne}"><div class="vuoto"><b>Nessun articolo</b><span>${cfg.testoVuoto ? cfg.testoVuoto() : "Aggiungi gli articoli con il tasto ＋ o sparandoli con la pistola."}</span></div></td></tr>`;
  }

  $("righeArt").onchange = e => {
    const r = RIGHE.find(x => x.pos === +e.target.dataset.riga);
    const campo = e.target.dataset.campo;
    if (!r || !campo) return;
    // I prezzi hanno sempre due decimali
    if (campo === "prezzo") r.prezzo = Math.round(num(e.target.value) * 100) / 100;
    else if (campo === "sconto") r.sconto = Math.min(100, Math.max(0, +e.target.value || 0));
    else if (campo === "iva") r.iva = e.target.value;
    else if ((campo === "sped" || campo === "qta") && oltreGiacenza(r.articolo, Math.max(1, +e.target.value || 0))) { disegna(); return; }   // torna il numero di prima
    else if (campo === "sped") { r.sped = Math.max(cfg.soloSpedita ? 1 : 0, +e.target.value || 0); if (cfg.soloSpedita) r.qta = r.sped; }
    else { const prima = r.qta; r.qta = Math.max(1, +e.target.value || 1); if (r.sped === prima) r.sped = r.qta; }
    r.tot = totRiga(r);
    cambiato();
  };
  $("righeArt").onclick = e => {
    const s = e.target.closest("[data-suggriga] .sugg[data-cod]");
    if (s) { completaRiga(RIGHE.find(x => x.pos === +s.parentNode.dataset.suggriga), ARTICOLI.find(a => a.codice === s.dataset.cod)); return; }
    const b = e.target.closest("button");
    if (!b) return;
    const r = RIGHE.find(x => x.pos === +(b.dataset.riga || b.dataset.togli || b.dataset.riprezzo || b.dataset.cambia));
    if (!r) return;
    if (b.dataset.togli) RIGHE.splice(RIGHE.indexOf(r), 1);
    else if (b.dataset.passo) {
      if (+b.dataset.passo > 0 && oltreGiacenza(r.articolo, pezziDi(r) + 1)) return;
      // finché Spedita segue Ordinata, i − / + di Ordinata cambiano anche quella
      if (b.dataset.quale === "sped") { r.sped = Math.max(cfg.soloSpedita ? 1 : 0, r.sped + +b.dataset.passo); if (cfg.soloSpedita) r.qta = r.sped; }
      else { const segue = r.sped === r.qta; r.qta = Math.max(1, r.qta + +b.dataset.passo); if (segue) r.sped = r.qta; }
    }
    else if (b.dataset.riprezzo) r.prezzo = cfg.prezzoDi(r.articolo);
    else if (b.dataset.cambia) { r.articolo = null; disegna(); document.querySelector(`[data-cercariga="${r.pos}"]`).focus(); return; }
    else if (b.dataset.sposta) {   // scambia la posizione con la riga accanto
      const lista = righeInOrdine(), vicina = lista[lista.indexOf(r) + +b.dataset.sposta];
      if (!vicina) return;
      [r.pos, vicina.pos] = [vicina.pos, r.pos];
      ultimaAggiunta = r.pos;
    }
    if (r.articolo) r.tot = totRiga(r);
    cambiato();
  };

  // Ricerca articoli (cercaArticoli): il codice o barcode esatto in cima per la pistola, poi quelli del fornitore scelto.
  // Con l'interruttore "anche di altri fornitori" (#tuttiForn) spento si vedono solo gli articoli del fornitore.
  const soloDelFornitore = () => $("tuttiForn") && !$("tuttiForn").checked;
  const trova = testo => cercaArticoli(testo, a => +altro(a), a => !soloDelFornitore() || !altro(a));
  const nessuno = testo => {
    const altrove = soloDelFornitore() && !ricercaCorta && cercaArticoli(testo)[0];
    return altrove ? `${esc(altrove.codice)} è di un altro fornitore: attiva "anche di altri fornitori" per aggiungerlo` : testoNessunArticolo();
  };
  if ($("tuttiForn")) $("tuttiForn").onchange = () => { $("addArt").dispatchEvent(new Event("input")); $("addArt").focus(); };
  // Giacenza della sede di lavoro accanto all'articolo suggerito (rossa se zero, "?" se non si conosce); pezzi interi, decimali solo per i metri
  const giacSugg = a => a.giac == null
    ? '<span class="giac-sugg ignota" title="Giacenza non disponibile">giac. ?</span>'
    : `<span class="giac-sugg${a.giac <= 0 ? " zero" : ""}" title="Pezzi in giacenza in questa sede">giac. ${a.giac.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span>`;
  const suggerimenti = (lista, attivo, testo = "") => lista.length
    ? lista.map((a, i) => `<div class="sugg${i === attivo ? " attivo" : ""}" data-cod="${esc(a.codice)}"><span class="codice">${esc(a.codice)}</span>${esc(a.descr)}${altro(a) ? '<span class="altro-forn">&nbsp;· altro fornitore</span>' : ""}${cfg.notaArticolo && cfg.notaArticolo(a) ? `<span class="nota-art">&nbsp;· ${esc(cfg.notaArticolo(a))}</span>` : ""}${cfg.giacenzaNeiSuggerimenti ? giacSugg(a) : ""}<small>${a.barcode}</small></div>`).join("")
    : `<div class="sugg" style="cursor:default;color:var(--muted)">${nessuno(testo)}</div>`;

  // Ricerca dentro la riga vuota (anche con la pistola: codice + Invio)
  let suggRiga = 0;
  $("righeArt").oninput = e => {
    const pos = e.target.dataset.cercariga;
    if (!pos) return;
    suggRiga = 0;
    const box = document.querySelector(`[data-suggriga="${pos}"]`);
    box.innerHTML = suggerimenti(trova(e.target.value), suggRiga, e.target.value);
    box.classList.toggle("show", !!e.target.value.trim());
  };
  $("righeArt").onkeydown = e => {
    const pos = e.target.dataset.cercariga;
    if (!pos) return;
    const lista = trova(e.target.value), box = document.querySelector(`[data-suggriga="${pos}"]`);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      suggRiga = Math.max(0, Math.min(suggRiga + (e.key === "ArrowDown" ? 1 : -1), lista.length - 1));
      box.innerHTML = suggerimenti(lista, suggRiga, e.target.value);
      e.preventDefault();
    }
    if (e.key === "Escape") box.classList.remove("show");
    if (e.key === "Enter") {
      e.preventDefault();
      if (lista[suggRiga]) completaRiga(RIGHE.find(x => x.pos === +pos), lista[suggRiga]);
      else if (e.target.value.trim()) avviso(ricercaCorta || cercaArticoli(e.target.value).length ? nessuno(e.target.value) : `Nessun articolo con codice o barcode "${e.target.value.trim()}"`);
    }
  };

  // Campo sopra la tabella (pistola o ricerca)
  let suggAttivo = 0;
  function mostraSugg() {
    const lista = trova($("addArt").value);
    suggAttivo = Math.min(suggAttivo, Math.max(0, lista.length - 1));
    $("suggArt").innerHTML = suggerimenti(lista, suggAttivo, $("addArt").value);
    $("suggArt").classList.toggle("show", !!$("addArt").value.trim());
  }
  const aggiungiDaCampo = art => {
    if (!puo()) return;
    if (!aggiungi(art, Math.max(1, +$("addQta").value || 1))) { $("addArt").select(); return; }
    $("addArt").value = ""; $("addQta").value = 1;
    $("suggArt").classList.remove("show");
  };
  $("addArt").oninput = () => { suggAttivo = 0; mostraSugg(); };
  $("addArt").onkeydown = e => {
    const lista = trova($("addArt").value);
    if (e.key === "ArrowDown") { suggAttivo = Math.min(suggAttivo + 1, lista.length - 1); mostraSugg(); e.preventDefault(); }
    if (e.key === "ArrowUp") { suggAttivo = Math.max(suggAttivo - 1, 0); mostraSugg(); e.preventDefault(); }
    if (e.key === "Escape") $("suggArt").classList.remove("show");
    if (e.key === "Enter") {
      e.preventDefault();
      if (lista[suggAttivo]) aggiungiDaCampo(lista[suggAttivo]);
      else if ($("addArt").value.trim()) avviso(ricercaCorta || cercaArticoli($("addArt").value).length ? nessuno($("addArt").value) : `Nessun articolo con codice o barcode "${$("addArt").value.trim()}"`);
    }
  };
  $("suggArt").onclick = e => {
    const s = e.target.closest(".sugg[data-cod]");
    if (s) aggiungiDaCampo(ARTICOLI.find(a => a.codice === s.dataset.cod));
  };
  $("addBtn").onclick = () => {
    const lista = trova($("addArt").value);
    if (lista[suggAttivo]) aggiungiDaCampo(lista[suggAttivo]); else { avviso("Spara o scrivi un codice prima di aggiungere"); $("addArt").focus(); }
  };
  document.addEventListener("click", e => {
    if (!e.target.closest(".cerca-art")) $("suggArt").classList.remove("show");
    if (!e.target.closest(".cerca-riga")) document.querySelectorAll("[data-suggriga]").forEach(s => s.classList.remove("show"));
  });
  $("nuovaRiga").onclick = nuovaRiga;
  $("nuoviInAlto").onchange = disegna;
  $("ordinaCodice").onchange = disegna;

  // Righe già pronte (movimento esistente): { qta, sped?, prezzo, sconto?, iva?, articolo, tot? }
  function carica(righe) {
    RIGHE.length = 0;
    giaScaricati.clear();
    righe.forEach((r, i) => {
      if (r.giaScaricati) giaScaricati.set(r.articolo.codice, r.giaScaricati);
      const riga = { pos: i + 1, sped: r.qta, sconto: 0, iva: ivaDiArticolo(r.articolo, estera()), ...r };
      if (riga.tot == null) riga.tot = totRiga(riga);
      RIGHE.push(riga);
    });
    totali(); disegna();
  }

  return {
    RIGHE, aggiungi, disegna, carica,
    aggiorna: () => { totali(); disegna(); },   // dopo aggiunte "silenziose"
    totale: () => Math.round(RIGHE.reduce((s, r) => s + r.tot, 0) * 100) / 100,
    pezzi: () => RIGHE.reduce((s, r) => s + (r.articolo ? (cfg.spedita ? r.sped : r.qta) : 0), 0),
    senzaArticolo: () => RIGHE.some(r => !r.articolo),
    // primo avviso di giacenza superata (es. controllo al salvataggio), oppure ""
    oltreGiacenza: () => {
      if (!cfg.limiteGiacenza) return "";
      const r = RIGHE.find(r => r.articolo && r.articolo.giac != null && pezziDi(r) > disponibili(r.articolo));
      return r ? testoOltre(r.articolo, pezziDi(r)) : "";
    },
    // copia per Annulla
    fotografia: () => RIGHE.map(r => ({ ...r })),
    ripristina: copia => { RIGHE.splice(0, RIGHE.length, ...copia); totali(); disegna(); },
    excel: nome => {
      const csv = [["#", "Codice", "Descrizione", "Ordinata"].concat(cfg.spedita ? ["Spedita"] : [], [cfg.etichettaPrezzo, "IVA", "Sconto %", "Totale"])]
        .concat(RIGHE.filter(r => r.articolo).map(r => [r.pos, r.articolo.codice, r.articolo.descr, r.qta].concat(cfg.spedita ? [r.sped] : [], [numero(r.prezzo), nomeIva(r.iva), r.sconto, numero(r.tot)])))
        .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      a.download = nome;
      a.click();
    }
  };
}
