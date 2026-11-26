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
    .select("id, stato, protocollo, numero_documento, data_movimento, data_documento, data_bolla, causale, spese, sede_id, sede_altra_id, fornitori(ragione_sociale), clienti(nome), movimenti_righe(quantita, totale)" + campi)
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
      : m.sede_altra_id ? await nomeSedeDb(db, m.sede_altra_id) : m.clienti ? m.clienti.nome : m.fornitori ? m.fornitori.ragione_sociale : "";
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
  ["aumento_giacenza", "Aumento Giacenza", "aumento.html"], ["diminuzione_giacenza", "Diminuzione Giacenza", "diminuzione.html"], ["riallineamento", "Inventario", "riallineamento.html"], ["ordine_cliente", "Ordine da Cliente", "ordine-cliente.html"], ["scarico_cliente", "Scarico a Cliente", "ordine-cliente.html"], ["esistenza", "Giacenza iniziale", null]
];
async function elencoTuttiMovimentiDb(db, sedeId) {
  const gruppi = await Promise.all(TIPI_DB.map(([tipo, nome, pagina]) =>
    elencoMovimentiDb(db, tipo, sedeId, pagina || "").then(righe => righe.map(r => ({ ...r, tipo: nome, url: pagina ? r.url : null })))));
  const arrivi = (await elencoMovimentiDb(db, "trasferimento_a_filiale", sedeId, "trasferimento.html", { inArrivo: true }))
    .map(r => ({ ...r, tipo: "Trasferimento da Filiale", chiave: "arr-" + r.id }));
  return gruppi.flat().concat(arrivi).sort((a, b) => (b.data || "").localeCompare(a.data || "") || b.id - a.id);
}

// Giacenza di una sede divisa per anno di acquisto (lotti), per tutti gli articoli: Map articolo_id → Map anno → pezzi.
// Stesse regole della scheda Giacenza dell'articolo (caricaGiacenzaVera in articolo.html): le entrate vanno nel loro anno
// (anno_acquisto del movimento, altrimenti l'anno della data; i trasferimenti ricevuti nell'anno di ricezione), le uscite
// tolgono dal lotto più vecchio; se si va sotto zero si toglie dall'anno in corso. Usata dagli Excel dell'inventario e da Giacenze.
// In più lotti.inizioAnno: Map articolo_id → giacenza al 1° gennaio dell'anno in corso (colonna "Q. iniz." di Giacenze).
async function lottiSedeDb(db, sedeId) {
  const STATI_OK = ["Definitivo", "Evaso"], annoOggi = new Date().getFullYear();
  const { data: tipi, error: e1 } = await db.from("tipi_movimento").select("codice, segno");
  if (e1) throw e1;
  const segno = new Map((tipi || []).map(t => [t.codice, +t.segno || 0]));
  const leggi = async filtro => {
    const tutte = [];
    for (let da = 0; ; da += 1000) {
      const { data, error } = await filtro(db.from("movimenti_righe")
        .select("id, articolo_id, quantita, movimenti!inner(id, tipo, stato, sede_id, sede_altra_id, data_movimento, anno_acquisto, ricevuto_il)"))
        .order("id").range(da, da + 999);
      if (error) throw error;
      tutte.push(...data);
      if (data.length < 1000) break;
    }
    return tutte;
  };
  const [proprie, ricevute] = await Promise.all([
    leggi(q => q.eq("movimenti.sede_id", sedeId).in("movimenti.stato", STATI_OK)),
    leggi(q => q.eq("movimenti.tipo", "trasferimento_a_filiale").eq("movimenti.sede_altra_id", sedeId).in("movimenti.stato", STATI_OK).not("movimenti.ricevuto_il", "is", null))
  ]);
  const eventi = [];
  proprie.forEach(r => {
    const m = r.movimenti, q = +r.quantita * (segno.get(m.tipo) || 0);
    if (q) eventi.push({ art: r.articolo_id, data: m.data_movimento, id: m.id, q, anno: m.anno_acquisto || +m.data_movimento.slice(0, 4) });
  });
  ricevute.forEach(r => {
    const m = r.movimenti;
    if (m.sede_id !== sedeId) eventi.push({ art: r.articolo_id, data: m.ricevuto_il.slice(0, 10), id: m.id, q: +r.quantita, anno: +m.ricevuto_il.slice(0, 4) });
  });
  eventi.sort((x, y) => x.data.localeCompare(y.data) || x.id - y.id);
  const lotti = new Map(), inizio = `${annoOggi}-01-01`;
  lotti.inizioAnno = new Map();
  eventi.forEach(e => {
    if (e.data < inizio) lotti.inizioAnno.set(e.art, (lotti.inizioAnno.get(e.art) || 0) + e.q);
    if (!lotti.has(e.art)) lotti.set(e.art, new Map());
    const l = lotti.get(e.art);
    if (e.q > 0) { l.set(e.anno, (l.get(e.anno) || 0) + e.q); return; }
    let resta = -e.q;
    [...l.keys()].sort((a, b) => a - b).forEach(anno => {
      const x = Math.min(resta, Math.max(0, l.get(anno)));
      if (x > 0) { l.set(anno, l.get(anno) - x); resta -= x; }
    });
    if (resta > 0) l.set(annoOggi, (l.get(annoOggi) || 0) - resta);
  });
  return lotti;
}

// Inventario in corso nella sede (riallineamento provvisorio): le pagine di vendita e scarico lo dicono in alto in rosso
async function avvisaInventarioInCorso(db, sedeId) {
  if (!db) return;
  const { data } = await db.from("movimenti").select("id, data_movimento").eq("tipo", "riallineamento").eq("sede_id", sedeId).eq("stato", "Provvisorio").limit(1);
  if (!data || !data.length) return;
  const m = data[0], dove = document.querySelector("main.content");
  if (dove) dove.insertAdjacentHTML("afterbegin", `<div class="banner ann" style="margin-bottom:12px">📋 <span><b>Inventario in corso</b> in questa sede (aperto il ${dataIt(m.data_movimento)}):
    non fare vendite né scarichi finché non è confermato. <a href="riallineamento.html?db=${m.id}" style="color:inherit;font-weight:700">Apri l'inventario</a></span></div>`);
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
// Ordini di questa sede a un'altra sede già preparati (Evaso) con articoli ancora da mandare: scheda "Con inevasi".
// Map id ordine → pezzi ancora da mandare (serve anche alla colonna "Arrivato" di Ordini a Fornitori).
async function ordiniConInevasiDb(db, sedeId) {
  const { data, error } = await db.from("inevasi").select("ordine_id, sede_fornitrice, residuo")
    .eq("sede_richiedente", sedeId).eq("stato_ordine", "Evaso").gt("residuo", 0);
  if (error) throw error;
  const mancano = new Map();
  data.filter(r => r.sede_fornitrice !== sedeId).forEach(r => mancano.set(r.ordine_id, (mancano.get(r.ordine_id) || 0) + +r.residuo));
  return mancano;
}

async function inevasiDb(db, filtro, { soloResiduo = true } = {}) {
  let q = db.from("inevasi").select("*");
  Object.entries(filtro).forEach(([k, v]) => { q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v); });
  const { data, error } = await q.order("data_ordine", { ascending: true }).order("ordine_riga_id", { ascending: true });
  if (error) throw error;
  // un ordine di una sede al fornitore che è lei stessa (es. Magazzino Centrale → "MAGAZZINO CENTRALE") non è un ordine di una filiale
  const righe = data.filter(r => r.sede_richiedente !== r.sede_fornitrice && (!soloResiduo || +r.residuo > 0));
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
// fornitoreId null = ordini di tutti i fornitori (riquadro in Carichi da Fornitori), tranne quelli a una sede (arrivano come trasferimento)
async function ordiniDaCaricareDb(db, fornitoreId, sedeId) {
  let q = db.from("movimenti")
    .select(`id, protocollo, data_movimento, stato, fornitore_id, fornitori(ragione_sociale, sede_collegata), movimenti_righe(id, quantita, prezzo, articoli(${CAMPI_ARTICOLO}))`)
    .eq("tipo", "ordine_fornitore").eq("sede_id", sedeId).in("stato", ["Provvisorio", "Definitivo"])
    .order("data_movimento", { ascending: true });
  if (fornitoreId) q = q.eq("fornitore_id", fornitoreId);
  let { data, error } = await q;
  if (error) throw error;
  if (!fornitoreId) data = data.filter(m => !(m.fornitori && m.fornitori.sede_collegata && m.fornitori.sede_collegata !== sedeId));
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
    fornitoreId: m.fornitore_id, fornitore: m.fornitori ? m.fornitori.ragione_sociale : "",
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
  // aggiunto_il (ora della riga, vendite e-commerce: database/26-ora-righe.sql) solo se la colonna c'è già
  const leggi = extra => db.from("movimenti")
    .select(`*, fornitori(id, codice, ragione_sociale), clienti(*), movimenti_righe(id, quantita, quantita_ordinata, ordine_riga_id, prezzo, sconto, etichette, totale${extra}, articoli(${CAMPI_ARTICOLO}))`)
    .eq("id", id).maybeSingle();
  let { data: m, error } = await leggi(", aggiunto_il");
  if (error && (error.code === "42703" || /aggiunto_il/.test(error.message))) ({ data: m, error } = await leggi(""));
  if (error) throw error;
  if (!m) return null;
  VERSIONI_MOV[m.id] = m.modificato_il;
  const ids = m.movimenti_righe.map(r => r.articoli.id);
  const { data: giac } = ids.length ? await db.from("giacenze").select("articolo_id, quantita").eq("sede_id", sedeId).in("articolo_id", ids) : { data: [] };
  const giacenza = new Map((giac || []).map(g => [g.articolo_id, +g.quantita]));
  m.righe = m.movimenti_righe.sort((a, b) => a.id - b.id).map(r => ({ ...r, articolo: articoloDalDb(r.articoli, giacenza.get(r.articoli.id) ?? null) }));
  return m;
}

// Salva un movimento: nuovo (id vuoto) o esistente (le righe vengono sostituite).
// mov: campi della tabella movimenti; righe: [{ articolo_id, quantita, quantita_ordinata, prezzo, sconto, etichette }]
// Restituisce l'id del movimento.
// Di solito salva con la funzione del database salva_movimento (database/27-funzioni-movimenti.sql): tutto o niente,
// controllo della giacenza e numero di bolla dati dal database. Se la funzione non c'è ancora, salva come prima.
let funzioniDbAssenti = false;
const funzioneMancante = e => e && (e.code === "PGRST202" || e.code === "42883" || /Could not find the function/i.test(e.message || ""));
// Versione di ogni movimento aperto (modificato_il letto da leggiMovimentoDb): salvando, il database controlla che nessun altro
// computer l'abbia cambiato nel frattempo (database/28-lavoro-in-contemporanea.sql)
const VERSIONI_MOV = {};
// Risposte del database quando si lavora da più computer insieme → errori con un codice e un messaggio chiaro
function erroreLavoroInsieme(error) {
  const [codice, a, b] = String(error.message || "").split("|");
  let e = null;
  if (codice === "CONFLITTO") e = Object.assign(new Error(`Questa scheda è stata cambiata da ${a} (${b}) mentre la stavi modificando: per non cancellare il suo lavoro le tue modifiche non sono state salvate. Ricarica la pagina e rifalle.`), { code: "CONFLITTO", chi: a, quando: b });
  if (codice === "GIORNATA_ESISTE") e = Object.assign(new Error(`Un altro computer ha appena creato la giornata di questo giorno (#${a}).`), { code: "GIORNATA_ESISTE", idAltra: +a });
  if (codice === "ORDINE_GIA_PREPARATO") e = Object.assign(new Error(`Nel frattempo un altro computer ha già mandato questi articoli dell'ordine: ${a}. Ricarica la pagina per vedere quanto resta da mandare.`), { code: "ORDINE_GIA_PREPARATO" });
  return e || error;
}
async function salvaMovimentoDb(db, mov, righe, id) {
  if (!funzioniDbAssenti) {
    const conVersione = id && VERSIONI_MOV[id] ? { ...mov, _versione: VERSIONI_MOV[id] } : mov;
    const { data, error } = await db.rpc("salva_movimento", { p_id: id || null, p_mov: conVersione, p_righe: righe });
    if (!error) return data;
    if (!funzioneMancante(error)) throw erroreLavoroInsieme(error);
    funzioniDbAssenti = true;
  }
  return salvaMovimentoVecchio(db, mov, righe, id);
}
async function salvaMovimentoVecchio(db, mov, righe, id) {
  const nuovo = !id;
  // le indicazioni per il database (_versione, _oltre_ok…) non sono colonne
  mov = Object.fromEntries(Object.entries(mov).filter(([k]) => !k.startsWith("_")));
  // senza la funzione del database il numero di bolla vuoto lo calcola la pagina
  if (["ordine_cliente", "scarico_cliente"].includes(mov.tipo) && !mov.numero_documento)
    mov = { ...mov, numero_documento: await prossimaBollaClienteDb(db, mov.sede_id, String(mov.data_bolla || mov.data_movimento || new Date().toISOString()).slice(0, 4)) };
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

// ---------- Ordini da clienti (ordine-cliente.html) ----------
// Prossimo numero di bolla del DDT della sede nell'anno, come nel gestionale attuale: "3/2026".
// La numerazione è una sola per ordini e scarichi a clienti (lo scarico nato da un ordine tiene il numero dell'ordine).
async function prossimaBollaClienteDb(db, sedeId, anno) {
  const { data, error } = await db.from("movimenti").select("numero_documento")
    .in("tipo", ["ordine_cliente", "scarico_cliente"]).eq("sede_id", sedeId).like("numero_documento", `%/${anno}`);
  if (error) throw error;
  const max = (data || []).reduce((m, r) => Math.max(m, parseInt(r.numero_documento, 10) || 0), 0);
  return `${max + 1}/${anno}`;
}

// Scarico della merce di un ordine da cliente (finestra "Vuoi scalare la merce dalla giacenza?" prima del DDT).
// Lo scarico è un movimento "scarico_cliente" Definitivo con le stesse righe, collegate all'ordine con ordine_riga_id:
// così si sa che quell'ordine è già stato scalato e non si scala due volte. Da quale anno di acquisto scalare: da decidere.
async function scaricoDiOrdineDb(db, ordineRigaIds) {
  if (!ordineRigaIds.length) return null;
  const { data, error } = await db.from("movimenti_righe").select("movimento_id, movimenti(id, tipo, stato)").in("ordine_riga_id", ordineRigaIds);
  if (error) throw error;
  const s = (data || []).find(r => r.movimenti && r.movimenti.tipo === "scarico_cliente" && r.movimenti.stato !== "Annullato");
  return s ? s.movimenti.id : null;
}
async function scaricaOrdineClienteDb(db, ordine, righe) {
  // con la funzione del database: scarico + ordine Evaso tutto insieme, e mai due volte
  if (!funzioniDbAssenti) {
    const { data, error } = await db.rpc("scala_ordine_cliente", { p_ordine: ordine.id });
    if (!error) return data;
    if (!funzioneMancante(error)) throw error;
  }
  return salvaMovimentoVecchio(db, {
    tipo: "scarico_cliente", stato: "Definitivo", sede_id: ordine.sede_id, cliente_id: ordine.cliente_id,
    data_movimento: new Date().toISOString().slice(0, 10), data_documento: ordine.data_bolla || ordine.data_movimento,
    numero_documento: ordine.numero_documento, data_bolla: ordine.data_bolla, causale: `Scarico dell'ordine da cliente #${ordine.id}`, spese: 0
  }, righe.map(r => ({ articolo_id: r.articoli.id, quantita: +r.quantita, prezzo: +r.prezzo, sconto: +r.sconto || 0, etichette: 0, ordine_riga_id: r.id })));
}
