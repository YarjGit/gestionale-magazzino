/**
 * MODALITÀ ANTEPRIMA (solo sviluppo): risponde con dati finti al posto di Supabase, per vedere e provare le schermate
 * senza accesso. Si accende solo con environment.anteprimaPossibile = true (development) E localStorage "anteprima" = "1".
 * Nel sito pubblicato (production) non è mai attiva. Non contiene dati reali.
 */
import { environment } from '../../../environments/environment';

export const anteprimaAttiva = (): boolean => {
  try {
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
    case 'fornitori': return FORNITORI;
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
