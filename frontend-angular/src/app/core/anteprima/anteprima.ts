/**
 * MODALITÀ ANTEPRIMA (solo sviluppo): risponde con dati finti al posto di Supabase, per vedere e provare le schermate
 * senza accesso. Si accende solo con environment.anteprimaPossibile = true (development) E localStorage "anteprima" = "1".
 * Nel sito pubblicato (production) non è mai attiva. Non contiene dati reali.
 */
import { environment } from '../../../environments/environment';

export const anteprimaAttiva = (): boolean => {
  try {
    // ?anteprima=1 la accende, ?anteprima=0 la spegne (resta ricordata in questo browser); solo in sviluppo
    const scelta = new URLSearchParams(location.search).get('anteprima');
    if (environment.anteprimaPossibile && (scelta === '1' || scelta === '0')) localStorage.setItem('anteprima', scelta);
    return environment.anteprimaPossibile && localStorage.getItem('anteprima') === '1';
  } catch {
    return false;
  }
};

type Riga = Record<string, unknown>;

const SEDI: Riga[] = [
  { id: 'cal-smm-roma', nome: 'CAL SMM Roma', gruppo: 'Negozi CAL', colore: '#d4009c', attiva: true },
  { id: 'magazzino-centrale', nome: 'Magazzino Centrale', gruppo: 'Laboratori e magazzino', colore: '#990000', attiva: true },
  { id: 'cal-roma-estero', nome: 'CAL Roma per Estero', gruppo: 'Negozi CAL', colore: '#eaff6a', attiva: true },
  { id: 'cal-bari', nome: 'CAL Bari', gruppo: 'Negozi CAL', colore: '#ffc0cb', attiva: false }
];

const ARTICOLI: Riga[] = [
  ['A0110/11', 'CALICE CERAM. TUTTO A TUTTI', '2000000000015', 25, 61, 3],
  ['B0701', 'STOLA RICAMATA VERDE', '2000000000022', 22, 59, 1],
  ['C2001', 'CASULA IN SETA AVORIO', '2000000000039', 180, 420, 0],
  ['D0501', "ROSARIO IN LEGNO D'ULIVO", '2000000000046', 1.9, 6.5, 46],
  ['E0102', 'CERI VOTIVI CONF. 50 PZ', '2000000000053', 9.8, 22, -1],
  ['F07/3 110', 'COTTA TER.LANA CM 110', '2000000000060', 46.72, 114, 5]
].map(([codice, descrizione, barcode, costo, prezzo, q], i) => ({
  id: `00000000-0000-0000-0000-00000000000${i + 1}`, codice, descrizione, barcode, costo_netto: costo, costo_lordo: costo, sconto: 0,
  prezzo_vendita_ivato: prezzo, prezzo_vendita: Math.round((prezzo as number) / 1.22 * 100) / 100, iva: 22, aliquota_iva: '22',
  fornitore_id: 'f-1', anno_listino: 2026, quantita: q, attivo: true, ricarico: 100, arrotondamento: 0, materiali: [],
  spese_confezione: 0, spese_imballaggio: 0, spese_accessorie: 0, scorta_minima: 2, modificato_il: '2026-11-20T10:00:00Z',
  aliquote_iva: { aliquota: 22 }
}));

const FORNITORI: Riga[] = [
  { id: 'f-1', codice: '900009', ragione_sociale: 'MAGAZZINO CENTRALE', sede_collegata: 'magazzino-centrale' },
  { id: 'f-2', codice: '645', ragione_sociale: 'Candele Esempio & C.', sede_collegata: null }
];

const risposta = (dati: unknown, totale?: number): Response =>
  new Response(JSON.stringify(dati), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Content-Range': `0-${Array.isArray(dati) ? Math.max(0, dati.length - 1) : 0}/${totale ?? (Array.isArray(dati) ? dati.length : 1)}` }
  });

/** Funzioni RPC finte. */
function rpc(nome: string, args: Riga): unknown {
  switch (nome) {
    case 'e_autorizzato':
    case 'e_amministratore':
      return true;
    case 'articoli_elenco': {
      const parole = String(args['p_cerca'] ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const scheda = String(args['p_scheda'] ?? '');
      const righe = ARTICOLI.filter(a => parole.every(p => `${a['codice']} ${a['descrizione']} ${a['barcode']}`.toLowerCase().includes(p)))
        .filter(a => {
          const q = Number(a['quantita']);
          return scheda === '' || (scheda === 'disp' && q > 0) || (scheda === 'esauriti' && q === 0) || (scheda === 'neg' && q < 0);
        });
      const da = Number(args['p_da'] ?? 0), quanti = Number(args['p_quanti'] ?? 25);
      return righe.slice(da, da + quanti).map(a => ({ ...a, totale: righe.length }));
    }
    case 'articoli_conteggi':
      return [{ tutti: 6, disponibili: 4, esauriti: 1, negativi: 1 }];
    case 'giacenze_sede':
      return ARTICOLI.map(a => ({ ...a, articolo_id: a['id'], totale: ARTICOLI.length }));
    case 'articolo_lotti':
      return [{ anno: 2024, iniziale: 2, caricata: 0, venduta: 1, altre_uscite: 0, finale: 1 },
        { anno: 2026, iniziale: 0, caricata: 4, venduta: 1, altre_uscite: 1, finale: 2 }];
    case 'articolo_previsto':
      return SEDI.filter(s => s['attiva']).map((s, i) => ({ sede_id: s['id'], sede_nome: s['nome'], giacenza: [3, 10, 0][i], in_arrivo: [2, 0, 0][i], prenotati: [1, 0, 0][i], previsto: [4, 10, 0][i] }));
    case 'articolo_movimenti':
      return [
        { movimento_id: 41, data: '2026-11-20', tipo: 'vendite_giornaliere', nome: 'Vendite Giornaliere', stato: 'Definitivo', q: -1, prima: 4, dopo: 3, lotti: { '2024': -1 }, ordinati: 0, prenotati: 0 },
        { movimento_id: 37, data: '2026-10-02', tipo: 'trasferimento_a_filiale', nome: 'Trasferimento a Filiale', stato: 'Definitivo', q: -1, prima: 5, dopo: 4, lotti: { '2026': -1 }, ordinati: 0, prenotati: 0 },
        { movimento_id: 30, data: '2026-03-14', tipo: 'carico_fornitore', nome: 'Carico da Fornitore', stato: 'Definitivo', q: 4, prima: 1, dopo: 5, lotti: { '2026': 4 }, ordinati: 0, prenotati: 0 },
        { movimento_id: 12, data: '2026-01-01', tipo: 'esistenza', nome: 'Giacenza iniziale', stato: 'Definitivo', q: 2, prima: 0, dopo: 2, lotti: { '2024': 2 }, ordinati: 0, prenotati: 0 }
      ].map(r => ({ ...r, totale: 4 }));
    case 'movimenti_elenco': {
      const tutte: Riga[] = [
        { id: 44, tipo: 'carico_fornitore', tipo_nome: 'Carico da Fornitore', segno: 1, stato: 'Provvisorio', protocollo: null, numero_documento: 'DDT 118', data_documento: '2026-11-23', data: '2026-11-24', data_bolla: '2026-11-23', causale: 'Candele per Natale', controparte: 'Candele Esempio & C.', colore: null, tot_art: 120.5, totale: 120.5, pezzi: 12, ricevuti: 0, etichetta: null, in_arrivo: false },
        { id: 41, tipo: 'vendite_giornaliere', tipo_nome: 'Vendite Giornaliere', segno: -1, stato: 'Definitivo', protocollo: null, numero_documento: null, data_documento: null, data: '2026-11-20', data_bolla: null, causale: 'Vendite del giorno', controparte: '', colore: null, tot_art: 61, totale: 61, pezzi: 1, ricevuti: 0, etichetta: null, in_arrivo: false },
        { id: 37, tipo: 'trasferimento_a_filiale', tipo_nome: 'Trasferimento a Filiale', segno: -1, stato: 'Definitivo', protocollo: '2026-000037', numero_documento: null, data_documento: null, data: '2026-10-02', data_bolla: null, causale: '', controparte: 'Magazzino Centrale', colore: '#990000', tot_art: 25, totale: 25, pezzi: 1, ricevuti: 0, etichetta: 'da confermare', in_arrivo: false },
        { id: 50, tipo: 'trasferimento_ricevuto', tipo_nome: 'Trasferimento da Filiale', segno: 1, stato: 'Da ricevere', protocollo: null, numero_documento: null, data_documento: null, data: '2026-11-25', data_bolla: null, causale: '', controparte: 'Magazzino Centrale', colore: '#990000', tot_art: 90, totale: 90, pezzi: 18, ricevuti: 0, etichetta: null, in_arrivo: true }
      ];
      const tipo = args['p_tipo'], arrivo = args['p_in_arrivo'] === true, stato = args['p_stato'];
      const righe = tutte.filter(r => (arrivo ? r['in_arrivo'] : tipo == null || r['tipo'] === tipo) && (!stato || r['stato'] === stato));
      return righe.map(r => ({ ...r, righe_totali: righe.length }));
    }
    case 'movimenti_riepilogo':
      return [{ stato: 'Definitivo', movimenti: 2, pezzi: 2, totale: 86 }, { stato: 'Provvisorio', movimenti: 1, pezzi: 12, totale: 120.5 }, { stato: 'Da ricevere', movimenti: 1, pezzi: 18, totale: 90 }];
    case 'ordini_da_caricare':
      return [{ id: 30, prot: '2026-000030', data: '2026-11-10', stato: 'Definitivo', fornitore: 'Candele Esempio & C.', righe: 3, pezzi: 40, fornitore_id: 'f-2' }];
    case 'ordini_da_preparare':
      return [];
    case 'ordini_alle_sedi':
      return [{ id: 31, prot: '#31', data: '2026-11-18', stato: 'Definitivo', sede: 'Magazzino Centrale', righe: 2, pezzi: 6, trasferimento_da_ricevere: null }];
    case 'inevasi_in_attesa':
      return [{ ordine_riga_id: 1, ordine_id: 31, data_ordine: '2026-11-18', stato_ordine: 'Definitivo', sede: 'Magazzino Centrale', articolo_id: 'a1', codice: 'B0701', descrizione: 'STOLA RICAMATA VERDE', ordinata: 4, trasferita: 0, residuo: 4 }];
    case 'ordine_da_caricare_righe':
      return [{ ordine_riga_id: 301, articolo_id: ARTICOLI[4]['id'], prezzo: 9.8, ordinata: 30, arrivata: 0, residuo: 30 },
        { ordine_riga_id: 302, articolo_id: ARTICOLI[3]['id'], prezzo: 1.9, ordinata: 10, arrivata: 0, residuo: 10 }];
    case 'giacenze_articoli':
      return ((args['p_articoli'] as string[]) ?? []).map((id, i) => ({ articolo_id: id, quantita: [3, 0, 5][i % 3] }));
    case 'cerca_articoli': {
      const t = String(args['p_testo'] ?? '').toLowerCase();
      return ARTICOLI.filter(a => `${a['codice']} ${a['descrizione']} ${a['barcode']}`.toLowerCase().includes(t))
        .map(a => ({ ...a, iva: 22, giacenza: a['quantita'], giacenza_altra: 10, altro_fornitore: false, esatto: a['barcode'] === t || String(a['codice']).toLowerCase() === t }))
        .sort((x, y) => Number(y.esatto) - Number(x.esatto));
    }
    case 'salva_carico':
    case 'salva_movimento':
    case 'salva_movimento_ed_evadi':
      return 99;
    case 'inevasi_dettaglio': {
      const riga = (n: number, art: Riga, ordine: number, stato: string, data: string, residuo: number, giac: number): Riga => ({
        ordine_riga_id: n, ordine_id: ordine, protocollo: null, data_ordine: data, stato_ordine: stato, sede_richiedente: 'cal-smm-roma', nome_richiedente: 'CAL SMM Roma',
        articolo_id: art['id'], codice: art['codice'], descrizione: art['descrizione'], barcode: art['barcode'], costo_netto: art['costo_netto'],
        prezzo_vendita_ivato: art['prezzo_vendita_ivato'], iva: 22, anno_listino: 2026, unita_misura: 'Numero', giacenza: giac, ordinata: residuo, trasferita: 0, annullata: 0, residuo });
      return args['p_solo_evasi']
        ? [riga(9, ARTICOLI[5], 25, 'Evaso', '2026-10-30', 2, 5)]
        : [riga(1, ARTICOLI[1], 31, 'Definitivo', '2026-11-18', 4, 1), riga(2, ARTICOLI[2], 31, 'Definitivo', '2026-11-18', 2, 0)];
    }
    case 'dashboard_sede':
      return {
        in_arrivo: [{ id: 30, prot: '2026-000030', data: '2026-11-10', nome: 'Candele Esempio & C.', righe: 3, pezzi: 40, tipo: 'Ordine a fornitore' },
          { id: 31, prot: '#31', data: '2026-11-18', nome: 'Magazzino Centrale', righe: 2, pezzi: 6, tipo: 'Ordine a sede' }],
        aperti: [{ id: 44, tipo: 'carico_fornitore', tipo_nome: 'Carico da Fornitore', stato: 'Provvisorio', data: '2026-11-24', nome: 'Candele Esempio & C.', totale: 120.5, pezzi: 12, in_arrivo: false }],
        sotto_scorta: 2,
        arrivi: [{ id: 50, data: '2026-11-25', da: 'Magazzino Centrale', articoli: 4, pezzi: 18 }],
        ricevuti: [], inevasi: { ordini: 0, articoli: 0 }
      };
    case 'fornitori_doppi':
      return [];
    case 'salva_fornitore':
    case 'salva_cliente':
      return 'x';
    case 'articoli_simili':
      return [];
    case 'salva_articolo':
      return ARTICOLI[0]['id'];
    default:
      return null;
  }
}

/** Tabelle finte (lettura). */
function tabella(nome: string, url: URL): unknown[] {
  const eq = (col: string): string | null => {
    const v = url.searchParams.get(col);
    return v?.startsWith('eq.') ? decodeURIComponent(v.slice(3)) : null;
  };
  switch (nome) {
    case 'sedi': return SEDI;
    case 'fornitori': {
      const cod = eq('codice');
      const righe: Riga[] = FORNITORI.map(f => ({ ...f, partita_iva: f['sede_collegata'] ? '00901011007' : null, usato: [{ sede_id: 'cal-smm-roma' }], aliquota_iva: 22, nazione: 'Italia', creato_il: '2026-01-03T10:00:00Z' }));
      return cod ? righe.filter(f => f['codice'] === cod) : righe;
    }
    case 'clienti': return [
      { id: 'c-1', codice: 'C00001', nome: 'PARROCCHIA ESEMPIO', tipo: 'Parrocchia', citta: 'ROMA', nazione: 'Italia', email: 'parrocchia@esempio.it' },
      { id: 'c-2', codice: 'C00002', nome: 'LIBRERIA ESEMPIO', tipo: 'Negozio', citta: 'MILANO', nazione: 'Italia' },
      { id: 'c-3', codice: 'C00003', nome: 'CONGRESSO ESEMPIO', tipo: 'Ente', citta: 'ALTÖTTING', nazione: 'Germania' }
    ];
    case 'aliquote_iva': return [
      { codice: '22', descrizione: 'Aliquota 22%', aliquota: 22, applicazione: 'A' },
      { codice: '04', descrizione: 'Aliquota 4%', aliquota: 4, applicazione: 'A' },
      { codice: '0', descrizione: 'Non assegnata', aliquota: 0, applicazione: 'A' }
    ];
    case 'fornitori_sedi': return [];
    case 'articoli': {
      const cod = eq('codice');
      return cod ? ARTICOLI.filter(a => a['codice'] === cod) : ARTICOLI;
    }
    case 'registro_attivita':
      return [{ id: 1, quando: '2026-11-20T10:00:00Z', email: 'prova@anteprima.it', sede: 'CAL SMM Roma', attivita: 'Modifica articolo', dettagli: 'prezzo_vendita_ivato, ricarico', tabella: 'articoli', riferimento: eq('riferimento') }];
    case 'giacenze': {
      const art = eq('articolo_id');
      return art ? SEDI.slice(0, 2).map((s, i) => ({ sede_id: s['id'], articolo_id: art, quantita: i ? 10 : 3 })) : [];
    }
    default: return [];
  }
}

/** fetch che risponde al posto di Supabase. */
export const fetchFinto: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const percorso = url.pathname;
  const corpo = typeof init?.body === 'string' && init.body ? (JSON.parse(init.body) as Riga) : {};
  await new Promise(r => setTimeout(r, 120));   // un po' di attesa, per vedere gli stati di caricamento
  if (percorso.includes('/rpc/')) return risposta(rpc(percorso.split('/rpc/')[1], corpo));
  if (percorso.includes('/rest/v1/')) {
    const righe = tabella(percorso.split('/rest/v1/')[1], url);
    const singolo = (init?.headers instanceof Headers ? init.headers.get('Accept') : (init?.headers as Record<string, string> | undefined)?.['Accept']) === 'application/vnd.pgrst.object+json';
    return risposta(singolo ? righe[0] ?? null : righe);
  }
  return risposta({});
};

export const SESSIONE_FINTA = { user: { email: 'prova@anteprima.it' } };
