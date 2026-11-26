import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { SupabaseService } from '../core/services/supabase.service';
import { AvvisiService } from './avvisi.service';
import { esportaCsv } from './csv';
import { Paginatore } from './paginatore';

export interface ColonnaAnagrafica<T> {
  t: string;
  valore: (r: T) => string;
  /** colonna del database per ordinare (senza = non si ordina) */
  ordina?: string;
  num?: boolean;
  larg?: number;
  /** testo blu che apre la scheda */
  link?: boolean;
  /** etichetta colorata */
  pill?: (r: T) => { sfondo: string; testo: string } | null;
  /** pallino colorato prima del testo (es. colore della sede) */
  pallino?: (r: T) => string | null;
}

export interface SchedaAnagrafica { k: string; t: string; colore: string; condizioni: string[] }
export interface FiltroAnagrafica { k: string; label: string; colonna: string; opzioni: string[] }

export interface ConfigAnagrafica<T> {
  titolo: string;
  sezione: string;
  tabella: string;
  select: string;
  /** colonne del database in cui cercare */
  cercaIn: string[];
  colonne: ColonnaAnagrafica<T>[];
  ordine: { colonna: string; crescente: boolean };
  schede?: SchedaAnagrafica[];
  filtri?: FiltroAnagrafica[];
  csv: string;
  /** testo del tasto "Nuovo …" (senza = niente tasto) */
  nuovo?: string;
  /** filtri sempre attivi (es. solo i fornitori della sede) */
  filtriBase?: Record<string, string | number | boolean | null>;
  vuoto?: string;
}

/**
 * Pagina anagrafica comune (prototipo/js/anagrafica.js): ricerca a parole, schede, filtri, ordinamento, pagine, esportazione.
 * A differenza del prototipo tutto avviene nel database: si legge una pagina alla volta (anche con migliaia di righe).
 */
@Component({
  selector: 'app-elenco-anagrafica',
  imports: [Paginatore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ config().titolo }}</h1>
        <div class="crumbs"><span>{{ config().sezione }}</span><span>-</span><span>{{ config().titolo }}</span></div>
      </div>
      <div class="azioni-ana">
        <ng-content />
        @if (config().nuovo) { <button class="btn btn-primary" (click)="crea.emit()">＋ {{ config().nuovo }}</button> }
      </div>
    </div>
    @if (config().schede?.length) {
      <div class="tabs schede-ana">
        <button class="tab" [class.active]="scheda() === ''" (click)="cambiaScheda('')">Tutti<span class="n">{{ conteggi()[''] ?? '…' }}</span></button>
        @for (s of config().schede; track s.k) {
          <button class="tab" [class.active]="scheda() === s.k" (click)="cambiaScheda(s.k)"><span class="dot" [style.background]="s.colore"></span>{{ s.t }}<span class="n">{{ conteggi()[s.k] ?? '…' }}</span></button>
        }
      </div>
    }
    <section class="panel">
      <div class="toolbar">
        <div class="tool-group"><button title="Aggiorna" (click)="ricarica()">↻</button><button title="Esporta per Excel" (click)="esporta()">⤓</button></div>
        @for (f of config().filtri ?? []; track f.k) {
          <div class="filtro-ana"><label>{{ f.label }}</label>
            <select (change)="cambiaFiltro(f.colonna, testo($event))"><option value="">Tutti</option>@for (o of f.opzioni; track o) { <option>{{ o }}</option> }</select></div>
        }
        <div class="cerca"><input type="search" placeholder="Cerca (anche più parole, anche a metà)…" [value]="cerca()" (input)="cerca.set(testo($event)); pagina.set(0)"></div>
      </div>
      @if (errore()) { <div class="avviso-accesso">⚠ {{ errore() }}</div> }
      <div class="table-wrap">
        <table>
          <thead><tr>
            @for (c of config().colonne; track c.t) {
              <th [class.num]="c.num" [class.sort]="!!c.ordina" (click)="ordinaPer(c)">{{ c.t }}
                @if (c.ordina) { <span class="freccia">{{ ordine().colonna === c.ordina ? (ordine().crescente ? '▲' : '▼') : '▾' }}</span> }</th>
            }
          </tr></thead>
          <tbody>
            @for (r of righe(); track $index) {
              <tr [class.cliccabile]="apribile()" (click)="apri.emit(r)">
                @for (c of config().colonne; track c.t) {
                  <td [class.num]="c.num">
                    @if (c.pill && c.pill(r); as p) { <span class="pill" [style.background]="p.sfondo" [style.color]="p.testo">{{ c.valore(r) }}</span> }
                    @else if (c.link) { <span class="ana-link testo-lungo" [style.max-width.px]="c.larg" [title]="c.valore(r)">{{ c.valore(r) }}</span> }
                    @else {
                      <div class="testo-medio-ana" [style.max-width.px]="c.larg" [title]="c.valore(r)">
                        @if (c.pallino && c.pallino(r); as col) { <span class="pallino" [style.background]="col"></span> }{{ c.valore(r) }}</div>
                    }
                  </td>
                }
              </tr>
            } @empty {
              <tr><td [attr.colspan]="config().colonne.length"><div class="vuoto">
                <b>{{ caricamento() ? 'Caricamento…' : cerca() || scheda() ? 'Nessun risultato' : 'Ancora nessun elemento in ' + config().titolo }}</b>
                @if (!caricamento()) { <span>{{ cerca() || scheda() ? 'Prova a cambiare ricerca o filtri.' : config().vuoto ?? '' }}</span> }
              </div></td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="piede">
        <div class="totali"><span>{{ config().titolo }}: <b>{{ totale() }}</b></span></div>
        <app-paginatore [pagina]="pagina()" [perPagina]="perPagina()" [totale]="totale()" [caricamento]="caricamento()" (paginaCambiata)="pagina.set($event)" (perPaginaCambiata)="perPagina.set($event); pagina.set(0)" />
      </div>
    </section>
  `,
  styles: `
    .azioni-ana { display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap; }
    .schede-ana { margin: 0 0 12px; }
    tr.cliccabile { cursor: pointer; }
    .pallino { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 7px; vertical-align: -1px; }
  `
})
export class ElencoAnagrafica<T extends object> {
  private readonly supabase = inject(SupabaseService);
  private readonly avvisi = inject(AvvisiService);

  readonly config = input.required<ConfigAnagrafica<T>>();
  /** false = le righe non si aprono */
  readonly apribile = input(true);
  readonly apri = output<T>();
  readonly crea = output<void>();

  protected readonly cerca = signal('');
  protected readonly scheda = signal('');
  protected readonly filtriScelti = signal<Record<string, string>>({});
  protected readonly ordine = signal<{ colonna: string; crescente: boolean }>({ colonna: '', crescente: true });
  protected readonly pagina = signal(0);
  protected readonly perPagina = signal(25);
  protected readonly righe = signal<T[]>([]);
  protected readonly totale = signal(0);
  protected readonly conteggi = signal<Partial<Record<string, number>>>({});
  protected readonly caricamento = signal(false);
  protected readonly errore = signal<string | null>(null);
  private richiesta = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly filtriDb = computed(() => {
    const f: Record<string, string | number | boolean | null> = { ...(this.config().filtriBase ?? {}) };
    for (const [k, v] of Object.entries(this.filtriScelti())) if (v) f[k] = v;
    return f;
  });

  constructor() {
    effect(() => {
      const o = this.config().ordine;
      untracked(() => this.ordine.set({ ...o }));
    });
    effect(() => {
      const args = { cfg: this.config(), cerca: this.cerca(), scheda: this.scheda(), filtri: this.filtriDb(), ordine: this.ordine(), pagina: this.pagina(), per: this.perPagina() };
      untracked(() => { clearTimeout(this.timer); this.timer = setTimeout(() => void this.carica(args), 250); });
    });
    // numeri delle schede: cambiano con i filtri fissi e le tendine, non con la ricerca
    effect(() => {
      const cfg = this.config(), filtri = this.filtriDb();
      untracked(() => void this.contaSchede(cfg, filtri));
    });
  }

  private condizioni(cfg: ConfigAnagrafica<T>, scheda: string): string[] {
    return cfg.schede?.find(s => s.k === scheda)?.condizioni ?? [];
  }

  private async carica(a: { cfg: ConfigAnagrafica<T>; cerca: string; scheda: string; filtri: Record<string, string | number | boolean | null>; ordine: { colonna: string; crescente: boolean }; pagina: number; per: number }): Promise<void> {
    if (!a.ordine.colonna) return;
    const mia = ++this.richiesta;
    this.caricamento.set(true);
    this.errore.set(null);
    try {
      const p = await this.supabase.pagina<T>(a.cfg.tabella, { select: a.cfg.select, pagina: a.pagina, perPagina: a.per, ordina: a.ordine,
        cerca: { testo: a.cerca, colonne: a.cfg.cercaIn }, filtri: a.filtri, condizioni: this.condizioni(a.cfg, a.scheda) });
      if (mia !== this.richiesta) return;
      this.righe.set(p.righe);
      this.totale.set(p.totale);
    } catch (e) {
      if (mia === this.richiesta) this.errore.set(e instanceof Error ? e.message : String(e));
    } finally {
      if (mia === this.richiesta) this.caricamento.set(false);
    }
  }

  private async contaSchede(cfg: ConfigAnagrafica<T>, filtri: Record<string, string | number | boolean | null>): Promise<void> {
    if (!cfg.schede?.length) return;
    // il select serve quando i filtri fissi usano una tabella collegata (es. fornitori della sede)
    const sel = cfg.select;
    try {
      const n = await Promise.all([this.supabase.conta(cfg.tabella, filtri, [], sel), ...cfg.schede.map(s => this.supabase.conta(cfg.tabella, filtri, s.condizioni, sel))]);
      const c: Record<string, number> = { '': n[0] };
      cfg.schede.forEach((s, i) => (c[s.k] = n[i + 1]));
      this.conteggi.set(c);
    } catch {
      /* i numeri delle schede non sono indispensabili */
    }
  }

  protected testo(e: Event): string { return (e.target as HTMLInputElement).value; }
  protected cambiaScheda(k: string): void { this.scheda.set(k); this.pagina.set(0); }
  protected cambiaFiltro(colonna: string, v: string): void { this.filtriScelti.update(f => ({ ...f, [colonna]: v })); this.pagina.set(0); }
  protected ordinaPer(c: ColonnaAnagrafica<T>): void {
    if (!c.ordina) return;
    const col = c.ordina;
    this.ordine.update(o => ({ colonna: col, crescente: o.colonna === col ? !o.crescente : true }));
  }

  /** Ricarica la pagina (anche dalla pagina che contiene l'elenco, dopo un salvataggio). */
  ricarica(): void {
    this.pagina.update(p => p);
    void this.carica({ cfg: this.config(), cerca: this.cerca(), scheda: this.scheda(), filtri: this.filtriDb(), ordine: this.ordine(), pagina: this.pagina(), per: this.perPagina() });
    void this.contaSchede(this.config(), this.filtriDb());
  }

  protected async esporta(): Promise<void> {
    const cfg = this.config();
    try {
      const tutte: T[] = [];
      for (let p = 0; p < 40; p++) {
        const r = await this.supabase.pagina<T>(cfg.tabella, { select: cfg.select, pagina: p, perPagina: 500, ordina: this.ordine(),
          cerca: { testo: this.cerca(), colonne: cfg.cercaIn }, filtri: this.filtriDb(), condizioni: this.condizioni(cfg, this.scheda()) });
        tutte.push(...r.righe);
        if (r.righe.length < 500) break;
      }
      esportaCsv(cfg.csv, [cfg.colonne.map(c => c.t)].concat(tutte.map(r => cfg.colonne.map(c => c.valore(r)))));
    } catch (e) { this.avvisi.errore(e); }
  }
}
