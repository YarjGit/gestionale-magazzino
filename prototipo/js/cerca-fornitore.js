// Scelta del fornitore scrivendo nome o codice (al posto di una tendina con centinaia di nomi).
// La tendina resta, nascosta, e tiene il valore scelto: il campo la imposta e fa partire "change", così il resto della pagina non cambia.
// Richiede dati-articoli.js (normalizza) e layout.js (esc); i suggerimenti usano lo stile .suggerimenti di scheda.css / elenco.css.
//   campoCercaFornitore(select, () => [{ id, codice, nome }], { vuoto: "Tutti" })  →  { aggiorna() }
//   vuoto: testo della scelta "nessun fornitore" (es. "Tutti" nei filtri); si ottiene anche cancellando il campo
//   aggiorna(): da chiamare quando la tendina cambia da codice (nuovo valore o nuovo elenco di fornitori)
function campoCercaFornitore(sel, elenco, { vuoto = "" } = {}) {
  const id = sel.id;
  const trova = testo => {
    const parole = normalizza(testo).split(/\s+/).filter(Boolean);
    return elenco().filter(f => parole.every(p => normalizza(`${f.codice} ${f.nome}`).includes(p))).slice(0, 15);
  };
  const testo = v => { const f = elenco().find(x => String(x.id) === String(v)); return f ? `${f.codice}: ${f.nome}` : ""; };
  sel.hidden = true;
  sel.insertAdjacentHTML("beforebegin", `<div class="cerca-forn-campo" style="position:relative">
    <input class="${sel.classList.contains("mod") ? "mod" : ""}" id="${id}Cerca" placeholder="${vuoto ? esc(vuoto) + " · scrivi nome o codice…" : "Scrivi nome o codice del fornitore…"}" autocomplete="off" ${sel.disabled ? "disabled" : ""}>
    <div class="suggerimenti" id="${id}Sugg"></div></div>`);
  const inp = document.getElementById(id + "Cerca"), box = document.getElementById(id + "Sugg");
  let attivo = 0;
  const aggiorna = () => { inp.value = testo(sel.value); };
  const mostra = () => {
    const lista = trova(inp.value);
    attivo = Math.min(attivo, Math.max(0, lista.length - 1));
    box.innerHTML = lista.length
      ? lista.map((f, i) => `<div class="sugg${i === attivo ? " attivo" : ""}" data-id="${esc(String(f.id))}"><span class="codice">${esc(f.codice)}</span>${esc(f.nome)}</div>`).join("")
      : '<div class="sugg" style="cursor:default;color:var(--muted)">Nessun fornitore trovato</div>';
    box.classList.add("show");
    return lista;
  };
  const scegli = f => {
    box.classList.remove("show");
    const v = f ? String(f.id) : "";
    if (sel.value !== v) { sel.value = v; sel.dispatchEvent(new Event("change")); }
    aggiorna();
  };
  inp.onfocus = () => { inp.select(); attivo = 0; mostra(); };
  inp.oninput = () => { attivo = 0; mostra(); };
  inp.onkeydown = e => {
    const lista = trova(inp.value);
    if (e.key === "ArrowDown") { attivo = Math.min(attivo + 1, lista.length - 1); mostra(); e.preventDefault(); }
    if (e.key === "ArrowUp") { attivo = Math.max(attivo - 1, 0); mostra(); e.preventDefault(); }
    if (e.key === "Enter") { e.preventDefault(); inp.value.trim() ? scegli(lista[attivo]) : scegli(null); }
    if (e.key === "Escape") { box.classList.remove("show"); aggiorna(); }
  };
  // uscendo senza scegliere torna il fornitore già scelto; campo svuotato = nessun fornitore
  inp.onblur = () => setTimeout(() => {
    if (box.matches(":hover")) return;
    box.classList.remove("show");
    if (!inp.value.trim()) scegli(null); else aggiorna();
  }, 150);
  box.onclick = e => { const s = e.target.closest(".sugg[data-id]"); if (s) scegli(elenco().find(f => String(f.id) === s.dataset.id)); };
  aggiorna();
  return { aggiorna };
}
