// Movimenti nel database (Supabase): leggere l'elenco, aprire un movimento, salvarlo.
// Richiede dati-articoli.js (CAMPI_ARTICOLO, articoloDalDb). La giacenza si aggiorna da sola:
// la vista "giacenze" somma le righe dei movimenti Definitivi/Evasi (vedi database/01-tabelle.sql).
// L'anno di acquisto di un carico è l'anno della sua data (data_movimento).

// Nomi delle sedi del database (id → nome), letti una volta
let nomiSediDb = null;
async function nomeSedeDb(db, id) {
  if (!nomiSediDb) {
    const { data, error } = await db.from("sedi").select("id, nome");
    if (error) throw error;
    nomiSediDb = new Map(data.map(s => [s.id, s.nome]));
  }
  return nomiSediDb.get(id) || id || "";
}

// Elenco dei movimenti di un tipo per la sede, nella forma delle righe di avviaElenco().
// inArrivo: movimenti fatti da altre sedi verso questa (es. trasferimenti ricevuti); la controparte è la sede che manda.
// Per i trasferimenti la controparte è la sede di arrivo, per gli altri il fornitore.
async function elencoMovimentiDb(db, tipo, sedeId, pagina, { inArrivo = false } = {}) {
  const leggi = campi => db.from("movimenti")
    .select("id, stato, protocollo, numero_documento, data_movimento, data_documento, data_bolla, causale, spese, sede_id, sede_altra_id, fornitori(ragione_sociale), movimenti_righe(quantita, totale)" + campi)
    .eq("tipo", tipo).eq(inArrivo ? "sede_altra_id" : "sede_id", sedeId)
    .order("data_movimento", { ascending: false }).order("id", { ascending: false });
  let { data, error } = await leggi(", ricevuto_il");
  // database senza la colonna della ricezione (15-ricezione-trasferimenti.sql non ancora eseguito): tutto come ricevuto
  if (error && error.code === "42703") ({ data, error } = await leggi(""));
  if (error) throw error;
  const righe = [];
  for (const m of data) {
    const totArt = Math.round(m.movimenti_righe.reduce((s, r) => s + +r.totale, 0) * 100) / 100;
    const cpNome = inArrivo ? await nomeSedeDb(db, m.sede_id)
      : m.sede_altra_id ? await nomeSedeDb(db, m.sede_altra_id) : m.fornitori ? m.fornitori.ragione_sociale : "";
    righe.push({
      id: m.id, chiave: "db-" + m.id, url: `${pagina}?db=${m.id}`,
      prot: m.protocollo || "", doc: m.numero_documento || "", dataDoc: m.data_documento || "",
      // Trasferimenti: chi riceve vede "Da ricevere" finché non conferma; chi manda vede l'etichetta "da confermare"
      stato: tipo !== "trasferimento_a_filiale" ? m.stato : !inArrivo ? m.stato
        : !["Definitivo", "Evaso"].includes(m.stato) ? m.stato : daRicevere(m) ? "Da ricevere" : "Ricevuto",
      tag: tipo === "trasferimento_a_filiale" && !inArrivo && ["Definitivo", "Evaso"].includes(m.stato)
        ? (daRicevere(m) ? { testo: "da confermare", colore: "#0891b2" } : { testo: "ricevuto", colore: "#18a058" }) : null,
      data: m.data_movimento, bolla: m.data_bolla || "", causale: m.causale || "",
      cpNome, totArt, tot: Math.round((totArt + +m.spese) * 100) / 100,
      nArt: m.movimenti_righe.reduce((s, r) => s + +r.quantita, 0), lab: "",
      // per la colonna "Arrivato" degli ordini: un ordine evaso è stato preparato
      ricevuti: m.stato === "Evaso" ? m.movimenti_righe.reduce((s, r) => s + +r.quantita, 0) : 0
    });
  }
  return righe;
}

// Tutti i movimenti della sede (pagina Tutti i Movimenti): ogni tipo con il suo nome e la sua scheda,
// più i trasferimenti arrivati da altre sedi. I tipi senza scheda (es. giacenza iniziale) si vedono ma non si aprono.
const TIPI_DB = [
  ["carico_fornitore", "Carico da Fornitore", "carico.html"], ["ordine_fornitore", "Ordine a Fornitore", "ordine.html"],
  ["trasferimento_a_filiale", "Trasferimento a Filiale", "trasferimento.html"], ["vendite_giornaliere", "Vendite Giornaliere", "vendita.html"],
  ["aumento_giacenza", "Aumento Giacenza", "aumento.html"], ["esistenza", "Giacenza iniziale", null]
];
async function elencoTuttiMovimentiDb(db, sedeId) {
  const gruppi = await Promise.all(TIPI_DB.map(([tipo, nome, pagina]) =>
    elencoMovimentiDb(db, tipo, sedeId, pagina || "").then(righe => righe.map(r => ({ ...r, tipo: nome, url: pagina ? r.url : null })))));
  const arrivi = (await elencoMovimentiDb(db, "trasferimento_a_filiale", sedeId, "trasferimento.html", { inArrivo: true }))
    .map(r => ({ ...r, tipo: "Trasferimento da Filiale", chiave: "arr-" + r.id }));
  return gruppi.flat().concat(arrivi).sort((a, b) => (b.data || "").localeCompare(a.data || "") || b.id - a.id);
}

// Trasferimento arrivato ma non ancora confermato da chi riceve (ricevuto_il manca solo se la colonna esiste)
const daRicevere = m => "ricevuto_il" in m && !m.ricevuto_il;

// Trasferimenti verso questa sede da confermare (merce in arrivo): [{ id, data, da, articoli, pezzi }]
async function trasferimentiDaRicevereDb(db, sedeId) {
  const { data, error } = await db.from("movimenti").select("id, data_movimento, sede_id, ricevuto_il, movimenti_righe(quantita)")
    .eq("tipo", "trasferimento_a_filiale").eq("sede_altra_id", sedeId).in("stato", ["Definitivo", "Evaso"]).is("ricevuto_il", null)
    .order("data_movimento", { ascending: true });
  if (error) { if (error.code === "42703") return []; throw error; }
  const lista = [];
  for (const m of data) lista.push({ id: m.id, data: m.data_movimento, da: await nomeSedeDb(db, m.sede_id), articoli: m.movimenti_righe.length,
    pezzi: Math.round(m.movimenti_righe.reduce((s, r) => s + +r.quantita, 0) * 100) / 100 });
  return lista;
}

// La sede che riceve conferma l'arrivo: da adesso la merce è nella sua giacenza
async function confermaRicezioneDb(db, id) {
  const { data: { session } } = await db.auth.getSession();
  const { data, error } = await db.from("movimenti").update({ ricevuto_il: new Date().toISOString(), ricevuto_da: session ? session.user.email : null })
    .eq("id", id).is("ricevuto_il", null).select("id");
  if (error) throw error;
  if (!data || !data.length) throw new Error("già confermato (o annullato) da qualcun altro: ricarica la pagina");
}

// ---------- Ordini alle sedi e INEVASI (vista "inevasi", database/14-inevasi.sql) ----------
// Righe della vista con l'articolo (forma di ARTICOLI) e la giacenza della sede che deve mandare la merce.
// filtro: { sede_fornitrice } o { sede_richiedente }, e facoltativi ordine_id / stato_ordine; soloResiduo: solo righe con qualcosa da mandare
async function inevasiDb(db, filtro, { soloResiduo = true } = {}) {
  let q = db.from("inevasi").select("*");
  Object.entries(filtro).forEach(([k, v]) => { q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v); });
  const { data, error } = await q.order("data_ordine", { ascending: true }).order("ordine_riga_id", { ascending: true });
  if (error) throw error;
  const righe = data.filter(r => !soloResiduo || +r.residuo > 0);
  if (!righe.length) return [];
  const ids = [...new Set(righe.map(r => r.articolo_id))];
  const { data: art, error: e2 } = await db.from("articoli").select(CAMPI_ARTICOLO).in("id", ids);
  if (e2) throw e2;
  const sedi = [...new Set(righe.map(r => r.sede_fornitrice))];
  const { data: giac } = await db.from("giacenze").select("sede_id, articolo_id, quantita").in("sede_id", sedi).in("articolo_id", ids);
  const g = new Map((giac || []).map(x => [x.sede_id + "|" + x.articolo_id, +x.quantita]));
  const articoli = new Map(art.map(a => [a.id, a]));
  for (const r of righe) {
    r.ordinata = +r.ordinata; r.trasferita = +r.trasferita; r.annullata = +r.annullata; r.residuo = +r.residuo;
    r.nomeRichiedente = await nomeSedeDb(db, r.sede_richiedente);
    r.articolo = articoloDalDb(articoli.get(r.articolo_id), g.get(r.sede_fornitrice + "|" + r.articolo_id) ?? 0);
  }
  return righe;
}

// ---------- Ordini a un fornitore esterno e carichi (la merce arriva con un "Carico da fornitore") ----------
// Ordini aperti (Provvisori o Definitivi) della sede verso il fornitore, con quello che deve ancora arrivare.
// Le righe dei carichi Definitivi collegate con ordine_riga_id contano come arrivate.
// [{ id, prot, data, stato, righe: [{ rigaId, articolo, prezzo, ordinata, arrivata, residuo }] }] (solo ordini con qualcosa da arrivare)
async function ordiniDaCaricareDb(db, fornitoreId, sedeId) {
  const { data, error } = await db.from("movimenti")
    .select(`id, protocollo, data_movimento, stato, movimenti_righe(id, quantita, prezzo, articoli(${CAMPI_ARTICOLO}))`)
    .eq("tipo", "ordine_fornitore").eq("fornitore_id", fornitoreId).eq("sede_id", sedeId).in("stato", ["Provvisorio", "Definitivo"])
    .order("data_movimento", { ascending: true });
  if (error) throw error;
  const ids = data.flatMap(m => m.movimenti_righe.map(r => r.id));
  const arrivate = new Map();
  if (ids.length) {
    const { data: car, error: e2 } = await db.from("movimenti_righe").select("ordine_riga_id, quantita, movimenti(tipo, stato)").in("ordine_riga_id", ids);
    if (e2) throw e2;
    car.filter(r => r.movimenti && r.movimenti.tipo === "carico_fornitore" && ["Definitivo", "Evaso"].includes(r.movimenti.stato))
      .forEach(r => arrivate.set(r.ordine_riga_id, (arrivate.get(r.ordine_riga_id) || 0) + +r.quantita));
  }
  return data.map(m => ({
    id: m.id, prot: m.protocollo || "#" + m.id, data: m.data_movimento, stato: m.stato,
    righe: m.movimenti_righe.sort((a, b) => a.id - b.id).map(r => {
      const arrivata = arrivate.get(r.id) || 0;
      return { rigaId: r.id, articolo: articoloDalDb(r.articoli, null), prezzo: +r.prezzo, ordinata: +r.quantita, arrivata, residuo: Math.max(0, +r.quantita - arrivata) };
    }).filter(r => r.residuo > 0)
  })).filter(o => o.righe.length);
}

// Dopo un carico Definitivo: gli ordini collegati in cui è arrivato tutto diventano Evasi (escono dagli ordini aperti)
async function evadiOrdiniArrivatiDb(db, ordineIds, fornitoreId, sedeId) {
  if (!ordineIds.length) return;
  const aperti = new Set((await ordiniDaCaricareDb(db, fornitoreId, sedeId)).map(o => o.id));
  const completi = ordineIds.filter(id => !aperti.has(id));
  if (completi.length) {
    const { error } = await db.from("movimenti").update({ stato: "Evaso", modificato_il: new Date().toISOString() }).in("id", completi);
    if (error) throw error;
  }
}

// Cancella (in tutto o in parte) un inevaso: resta registrato chi, quando, quanto e perché
async function annullaInevasoDb(db, ordineRigaId, quantita, motivo) {
  const { data: { session } } = await db.auth.getSession();
  const { error } = await db.from("inevasi_annullati").insert({
    ordine_riga_id: ordineRigaId, quantita, motivo: motivo || null, annullato_da: session ? session.user.email : null
  });
  if (error) throw error;
}

// Registro delle cancellazioni per un insieme di righe d'ordine (dal più recente)
async function inevasiAnnullatiDb(db, ordineRigaIds) {
  if (!ordineRigaIds.length) return [];
  const { data, error } = await db.from("inevasi_annullati").select("*").in("ordine_riga_id", ordineRigaIds).order("annullato_il", { ascending: false });
  if (error) throw error;
  return data;
}

// Un movimento con le sue righe; ogni riga ha l'articolo nella forma di ARTICOLI (con la giacenza della sede)
async function leggiMovimentoDb(db, id, sedeId) {
  const { data: m, error } = await db.from("movimenti")
    .select(`*, fornitori(id, codice, ragione_sociale), movimenti_righe(id, quantita, quantita_ordinata, ordine_riga_id, prezzo, sconto, etichette, totale, articoli(${CAMPI_ARTICOLO}))`)
    .eq("id", id).maybeSingle();
  if (error) throw error;
  if (!m) return null;
  const ids = m.movimenti_righe.map(r => r.articoli.id);
  const { data: giac } = ids.length ? await db.from("giacenze").select("articolo_id, quantita").eq("sede_id", sedeId).in("articolo_id", ids) : { data: [] };
  const giacenza = new Map((giac || []).map(g => [g.articolo_id, +g.quantita]));
  m.righe = m.movimenti_righe.sort((a, b) => a.id - b.id).map(r => ({ ...r, articolo: articoloDalDb(r.articoli, giacenza.get(r.articoli.id) ?? null) }));
  return m;
}

// Salva un movimento: nuovo (id vuoto) o esistente (le righe vengono sostituite).
// mov: campi della tabella movimenti; righe: [{ articolo_id, quantita, quantita_ordinata, prezzo, sconto, etichette }]
// Restituisce l'id del movimento.
async function salvaMovimentoDb(db, mov, righe, id) {
  const nuovo = !id;
  if (id) {
    const { error } = await db.from("movimenti").update({ ...mov, modificato_il: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    const { error: e2 } = await db.from("movimenti_righe").delete().eq("movimento_id", id);
    if (e2) throw e2;
  } else {
    const { data: { session } } = await db.auth.getSession();
    const { data, error } = await db.from("movimenti").insert({ ...mov, creato_da: session ? session.user.email : null }).select("id").single();
    if (error) throw error;
    id = data.id;
  }
  if (righe.length) {
    const { error } = await db.from("movimenti_righe").insert(righe.map(r => ({ ...r, movimento_id: id })));
    if (error) {
      // un movimento nuovo senza righe non deve restare: si toglie e si segnala l'errore
      if (nuovo) await db.from("movimenti").delete().eq("id", id);
      throw error;
    }
  }
  return id;
}
