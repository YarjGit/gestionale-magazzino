// Movimenti nel database (Supabase): leggere l'elenco, aprire un movimento, salvarlo.
// Richiede dati-articoli.js (CAMPI_ARTICOLO, articoloDalDb). La giacenza si aggiorna da sola:
// la vista "giacenze" somma le righe dei movimenti Definitivi/Evasi (vedi database/01-tabelle.sql).
// L'anno di acquisto di un carico è l'anno della sua data (data_movimento).

// Elenco dei movimenti di un tipo per la sede, nella forma delle righe di avviaElenco()
async function elencoMovimentiDb(db, tipo, sedeId, pagina) {
  const { data, error } = await db.from("movimenti")
    .select("id, stato, protocollo, numero_documento, data_movimento, data_documento, data_bolla, causale, spese, fornitori(ragione_sociale), movimenti_righe(quantita, totale)")
    .eq("tipo", tipo).eq("sede_id", sedeId)
    .order("data_movimento", { ascending: false }).order("id", { ascending: false });
  if (error) throw error;
  return data.map(m => {
    const totArt = Math.round(m.movimenti_righe.reduce((s, r) => s + +r.totale, 0) * 100) / 100;
    return {
      id: m.id, chiave: "db-" + m.id, url: `${pagina}?db=${m.id}`,
      prot: m.protocollo || "", doc: m.numero_documento || "", dataDoc: m.data_documento || "",
      stato: m.stato, data: m.data_movimento, bolla: m.data_bolla || "", causale: m.causale || "",
      cpNome: m.fornitori ? m.fornitori.ragione_sociale : "",
      totArt, tot: Math.round((totArt + +m.spese) * 100) / 100,
      nArt: m.movimenti_righe.reduce((s, r) => s + r.quantita, 0), lab: ""
    };
  });
}

// Un movimento con le sue righe; ogni riga ha l'articolo nella forma di ARTICOLI (con la giacenza della sede)
async function leggiMovimentoDb(db, id, sedeId) {
  const { data: m, error } = await db.from("movimenti")
    .select(`*, fornitori(id, codice, ragione_sociale), movimenti_righe(id, quantita, quantita_ordinata, prezzo, sconto, etichette, totale, articoli(${CAMPI_ARTICOLO}))`)
    .eq("id", id).maybeSingle();
  if (error) throw error;
  if (!m) return null;
  const ids = m.movimenti_righe.map(r => r.articoli.id);
  const { data: giac } = ids.length ? await db.from("giacenze").select("articolo_id, quantita").eq("sede_id", sedeId).in("articolo_id", ids) : { data: [] };
  const giacenza = new Map((giac || []).map(g => [g.articolo_id, g.quantita]));
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
