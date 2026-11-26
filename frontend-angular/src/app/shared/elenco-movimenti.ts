import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import type { MovimentiFiltri, MovimentoElencoRiga, SedeId, TipoMovimentoCodice } from '../core/models/database.types';
import { toNumber } from '../core/models/database.types';
import { SedeService } from '../core/services/sede.service';
import { SupabaseService } from '../core/services/supabase.service';
import { AvvisiService } from './avvisi.service';
import { esportaCsv } from './csv';
import { dataIt, euro, numero } from './formato';
import { Paginatore } from './paginatore';
import { percorsoMovimento } from './percorsi-movimenti';

/** Stati dei movimenti: colore della striscia, dell'etichetta e della scheda in alto (prototipo/js/elenco.js). */
export const STATI: Record<string, { plurale: string; colore: string; icona: string }> = {
  Definitivo: { plurale: 'Definitivi', colore: '#18a058', icona: '✔' },
  Provvisorio: { plurale: 'Provvisori', colore: '#e58a00', icona: '◷' },
  Riordino: { plurale: 'Riordini', colore: '#7c4dff', icona: '↻' },
  Evaso: { plurale: 'Evasi', colore: '#64748b', icona: '■' },
  Annullato: { plurale: 'Annullati', colore: '#c62828', icona: '✕' },
  'Da ricevere': { plurale: 'Da ricevere', colore: '#0891b2', icona: '📦' },
  Ricevuto: { plurale: 'Ricevuti', colore: '#18a058', icona: '✔' }
};

export type ColonnaMovimento = 'numero' | 'giorno' | 'tipo' | 'stato' | 'data' | 'controparte' | 'bolla' | 'causale' | 'arrivato' | 'tot_art' | 'totale' | 'pezzi';

export interface ConfigElencoMovimenti {
  titolo: string;
  tipo: TipoMovimentoCodice | null;
  inArrivo?: boolean;
  canale?: 'ecommerce' | 'negozio';
  stati: string[];
  colonne: ColonnaMovimento[];
  /** intestazioni diverse da quelle standard (es. data: "Carico") */
  titoli?: Partial<Record<ColonnaMovimento, string>>;
  csv: string;
  /** testo e indirizzo del tasto "Nuovo …" */
  nuovo?: { testo: string; percorso: (string | number)[]; query?: Record<string, string | number> };
  /** etichetta del filtro sulla controparte (Fornitore, Cliente, Sede…); senza = niente filtro */
  controparte?: string;
  nota?: string;
}

const TITOLI: Record<ColonnaMovimento, string> = {
  numero: 'Numero / Doc.', giorno: 'Giorno', tipo: 'Tipo di movimento', stato: 'Stato', data: 'Data', controparte: 'Controparte',
  bolla: 'Bolla', causale: 'Causale', arrivato: 'Arrivato', tot_art: 'Imp. articoli', totale: 'Totale', pezzi: 'Pezzi'
};
const ORDINA: Partial<Record<ColonnaMovimento, string>> = {
  numero: 'data', giorno: 'data', data: 'data', tipo: 'tipo', stato: 'stato', controparte: 'controparte', bolla: 'bolla', causale: 'causale',
  tot_art: 'tot_art', totale: 'totale', pezzi: 'pezzi'
};

/**
 * Elenco movimenti comune (prototipo/js/elenco.js): schede per stato, filtri, ricerca a parole, ordinamento, pagine, totali.
 * Filtri, ordinamento e pagine li fa il database (movimenti_elenco / movimenti_riepilogo): i movimenti crescono ogni giorno.
 * Sopra l'elenco la pagina può mettere i suoi riquadri (ordini da caricare, merce da ricevere…) con <ng-content>.
 */
@Component({
  selector: 'app-elenco-movimenti',
  imports: [Paginatore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './elenco-movimenti.html',
  styles: `
    tr.cliccabile { cursor: pointer; }
    .azioni-top { display: flex; gap: 8px; align-items: center; margin-left: auto; flex-wrap: wrap; }
    .tag { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 5px; font-size: 0.7rem; font-weight: 600; }
    .pallino { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: -1px; }
    .filtri-body[hidden] { display: none; }
    .grid-filtri .f input, .grid-filtri .f select { width: 100%; }
  `
})
export class ElencoMovimenti {
  private readonly supabase = inject(SupabaseService);
  private readonly sede = inject(SedeService);
  private readonly avvisi = inject(AvvisiService);
  private readonly router = inject(Router);

  readonly config = input.required<ConfigElencoMovimenti>();
  /** la pagina gestisce l'apertura (es. vendite e-commerce); senza, si apre la scheda del movimento */
  readonly apri = output<MovimentoElencoRiga>();
  readonly gestisciApertura = input(false);

  protected readonly STATI = STATI;
  protected readonly dataIt = dataIt;
  protected readonly numero = numero;
  protected readonly euro = euro;
  protected readonly toNumber = toNumber;

  protected readonly scheda = signal('');
  protected readonly cerca = signal('');
  protected readonly anno = signal<number | null>(new Date().getFullYear());
  protected readonly dal = signal('');
  protected readonly al = signal('');
  protected readonly controparte = signal('');
  protected readonly articolo = signal('');
  protected readonly filtriAperti = signal(false);
  protected readonly ordine = signal<{ colonna: ColonnaMovimento; crescente: boolean }>({ colonna: 'numero', crescente: false });
  protected readonly pagina = signal(0);
  protected readonly perPagina = signal(25);

  protected readonly righe = signal<MovimentoElencoRiga[]>([]);
  protected readonly totaleRighe = signal(0);
  protected readonly riepilogo = signal<{ stato: string; movimenti: number; pezzi: number; totale: number }[]>([]);
  protected readonly caricamento = signal(false);
  protected readonly errore = signal<string | null>(null);
  private richiesta = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly filtriAttivi = computed(() => [this.dal(), this.al(), this.controparte(), this.articolo()].filter(Boolean).length);
  protected readonly conteggio = computed(() => {
    const m = new Map(this.riepilogo().map(r => [r.stato, r.movimenti]));
    return (stato: string): number => (stato ? m.get(stato) ?? 0 : this.riepilogo().reduce((s, r) => s + r.movimenti, 0));
  });
  /** totali del piede: senza gli annullati */
  protected readonly totali = computed(() => {
    const sel = this.riepilogo().filter(r => (!this.scheda() || r.stato === this.scheda()));
    const validi = sel.filter(r => r.stato !== 'Annullato');
    return { movimenti: sel.reduce((s, r) => s + r.movimenti, 0), pezzi: validi.reduce((s, r) => s + r.pezzi, 0), totale: validi.reduce((s, r) => s + r.totale, 0) };
  });

  constructor() {
    effect(() => {
      const f = this.filtri(), stato = this.scheda(), o = this.ordine(), p = this.pagina(), n = this.perPagina();
      untracked(() => { clearTimeout(this.timer); this.timer = setTimeout(() => void this.carica(f, stato, o, p, n), 250); });
    });
  }

  private filtri(): MovimentiFiltri {
    const c = this.config();
    return {
      p_sede: (this.sede.sedeId() ?? '') as SedeId, p_tipo: c.tipo, p_in_arrivo: !!c.inArrivo, p_canale: c.canale ?? null,
      p_cerca: this.cerca().trim() || null, p_dal: this.dal() || null, p_al: this.al() || null, p_anno: this.anno() || null,
      p_controparte: this.controparte().trim() || null, p_articolo: this.articolo().trim() || null
    };
  }

  private async carica(f: MovimentiFiltri, stato: string, o: { colonna: ColonnaMovimento; crescente: boolean }, pagina: number, per: number): Promise<void> {
    const mia = ++this.richiesta;
    this.caricamento.set(true);
    this.errore.set(null);
    try {
      const [righe, riep] = await Promise.all([
        this.supabase.rpc('movimenti_elenco', { ...f, p_stato: stato || null, p_ordina: ORDINA[o.colonna] ?? 'data', p_crescente: o.crescente, p_da: pagina * per, p_quanti: per }),
        this.supabase.rpc('movimenti_riepilogo', f)
      ]);
      if (mia !== this.richiesta) return;
      this.righe.set(righe);
      this.totaleRighe.set(righe.length ? toNumber(righe[0].righe_totali) : 0);
      this.riepilogo.set(riep.map(r => ({ stato: r.stato, movimenti: toNumber(r.movimenti), pezzi: toNumber(r.pezzi), totale: toNumber(r.totale) })));
    } catch (e) {
      if (mia === this.richiesta) this.errore.set(e instanceof Error ? e.message : String(e));
    } finally {
      if (mia === this.richiesta) this.caricamento.set(false);
    }
  }

  ricarica(): void {
    void this.carica(this.filtri(), this.scheda(), this.ordine(), this.pagina(), this.perPagina()).then(() => this.avvisi.mostra('Elenco aggiornato'));
  }

  protected titolo(c: ColonnaMovimento): string { return this.config().titoli?.[c] ?? TITOLI[c]; }
  protected ordinabile(c: ColonnaMovimento): boolean { return !!ORDINA[c]; }
  protected ordinaPer(c: ColonnaMovimento): void {
    if (!ORDINA[c]) return;
    this.ordine.update(o => ({ colonna: c, crescente: o.colonna === c ? !o.crescente : c === 'controparte' || c === 'causale' }));
    this.pagina.set(0);
  }
  protected testo(e: Event): string { return (e.target as HTMLInputElement).value; }
  protected cambia(s: { set: (v: string) => void }, e: Event): void { s.set(this.testo(e)); this.pagina.set(0); }
  protected cambiaAnno(e: Event): void { const v = Number(this.testo(e)); this.anno.set(v > 1990 && v < 2200 ? v : null); this.pagina.set(0); }
  protected scegliScheda(s: string): void { this.scheda.set(s); this.pagina.set(0); }
  protected azzera(): void { this.dal.set(''); this.al.set(''); this.controparte.set(''); this.articolo.set(''); this.anno.set(new Date().getFullYear()); this.pagina.set(0); }

  protected stile(stato: string): { colore: string; icona: string } { return STATI[stato] ?? { colore: '#64748b', icona: '•' }; }
  protected giornoSettimana(iso: string): string { return new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short' }); }
  protected percentuale(r: MovimentoElencoRiga): number { const t = toNumber(r.pezzi); return t ? Math.round(toNumber(r.ricevuti) / t * 100) : 0; }
  protected classeTipo(r: MovimentoElencoRiga): [string, string] {
    return r.tipo === 'riallineamento' ? ['rettifica', '⇅'] : r.segno > 0 || r.tipo === 'ordine_fornitore' ? ['entrata', '↓'] : ['uscita', '↑'];
  }

  protected apriRiga(r: MovimentoElencoRiga): void {
    if (this.gestisciApertura()) { this.apri.emit(r); return; }
    const p = percorsoMovimento(r.tipo, r.id);
    if (p) void this.router.navigate(p);
    else this.avvisi.mostra('Questo movimento (giacenza iniziale) non ha una scheda da aprire');
  }

  protected nuovo(): void {
    const n = this.config().nuovo;
    if (n) void this.router.navigate(n.percorso, { queryParams: n.query });
  }

  /** Esporta le righe filtrate (lette a blocchi di 500 dal database) per Excel. */
  protected async esporta(): Promise<void> {
    const c = this.config();
    try {
      const tutte: MovimentoElencoRiga[] = [];
      for (let da = 0; da < 20000; da += 500) {
        const r = await this.supabase.rpc('movimenti_elenco', { ...this.filtri(), p_stato: this.scheda() || null, p_ordina: 'data', p_crescente: false, p_da: da, p_quanti: 500 });
        tutte.push(...r);
        if (r.length < 500) break;
      }
      const cols = c.colonne;
      const valore = (r: MovimentoElencoRiga, k: ColonnaMovimento): string => {
        switch (k) {
          case 'numero': return [r.protocollo ?? '', '#' + r.id, r.numero_documento ?? ''].filter(Boolean).join(' ');
          case 'giorno': case 'data': return dataIt(r.data);
          case 'tipo': return r.tipo_nome;
          case 'stato': return r.stato;
          case 'controparte': return r.controparte;
          case 'bolla': return dataIt(r.data_bolla);
          case 'causale': return r.causale ?? '';
          case 'arrivato': return `${toNumber(r.ricevuti)}/${toNumber(r.pezzi)}`;
          case 'tot_art': return numero(toNumber(r.tot_art));
          case 'totale': return numero(toNumber(r.totale));
          case 'pezzi': return String(toNumber(r.pezzi));
        }
      };
      esportaCsv(c.csv, [cols.map(k => this.titolo(k))].concat(tutte.map(r => cols.map(k => valore(r, k)))));
    } catch (e) { this.avvisi.errore(e); }
  }
}
