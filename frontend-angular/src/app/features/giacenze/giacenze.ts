import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import type { GiacenzaElencoRiga, GiacenzeArgs } from '../../core/models/database.types';
import { toNumber } from '../../core/models/database.types';
import { SedeService } from '../../core/services/sede.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { AvvisiService } from '../../shared/avvisi.service';
import { tabellaExcel, type Cella } from '../../shared/excel';
import { euro, numero, quantita } from '../../shared/formato';
import { Paginatore } from '../../shared/paginatore';

/** Categorie degli articoli (iniziale del codice), come prototipo/js/categorie.js. */
const CATEGORIE: { cod: string; descr: string }[] = [
  { cod: 'A', descr: 'Vasi sacri' }, { cod: 'B', descr: 'Arredo' }, { cod: 'D', descr: 'Scatole per ostie' }, { cod: 'F', descr: 'Paramenti' },
  { cod: 'G', descr: 'Abbigliamento' }, { cod: 'I', descr: 'Colletti' }, { cod: 'N', descr: 'Pizzi e tramezzi' }, { cod: 'O', descr: 'Bottoni e ganci' },
  { cod: 'P', descr: 'Prima comunione' }, { cod: 'R', descr: 'Oggetti per la preghiera' }, { cod: 'C', descr: 'Candele e ceri' }, { cod: 'L', descr: 'Libri e editoria' }
];
/** Schede in alto (come il prototipo): niente "Da ricalcolare", la giacenza si calcola sempre dai movimenti. */
const SCHEDE = [
  { k: '', t: 'Tutti', colore: '' }, { k: 'disp', t: 'Disponibili', colore: '#18a058' }, { k: 'scorta', t: 'Sotto scorta', colore: '#e58a00' },
  { k: 'zero', t: 'Esauriti', colore: '#94a3b8' }, { k: 'neg', t: 'Negativi', colore: '#c62828' }
] as const;
type Scheda = (typeof SCHEDE)[number]['k'];
type Conteggi = Record<'tutti' | 'disp' | 'scorta' | 'zero' | 'neg', number> & { pezzi: number; valore: number };

/**
 * Giacenze della sede di lavoro, come prototipo/giacenze.html: schede Disponibili / Sotto scorta / Esauriti / Negativi,
 * pezzi per anno di acquisto, giacenza al 1° gennaio, ordinato (fornitori e inevasi) e prenotato dai clienti,
 * "Anche senza giacenza", filtri ed Excel. Filtri, conti e pagine li fa il database (giacenze_elenco / giacenze_riepilogo, database/34).
 */
@Component({
  selector: 'app-giacenze',
  imports: [Paginatore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head">
      <div><h1 class="page-title">Giacenze</h1><div class="crumbs"><span>Magazzino</span><span>-</span><span>Giacenze</span><span>-</span><span>{{ sede.sede()?.nome }}</span></div></div>
      <div class="azioni-top"><button class="btn btn-light" (click)="esporta()" title="Scarica in Excel le giacenze mostrate (con i filtri scelti)">📊 Esporta giacenze (Excel)</button></div>
    </div>
    <div class="tabs" style="margin:0 0 12px">
      @for (s of schede; track s.k) {
        <button class="tab" [class.active]="scheda() === s.k" (click)="scheda.set(s.k); pagina.set(0)">
          @if (s.colore) { <span class="dot" [style.background]="s.colore"></span> }{{ s.t }}<span class="n">{{ numeroScheda(s.k) }}</span></button>
      }
    </div>

    <section class="panel filtri" [class.chiusi]="!filtriAperti()">
      <div class="filtri-head" (click)="filtriAperti.set(!filtriAperti())"><h2>Filtri di ricerca</h2>
        @if (filtriAttivi()) { <span class="badge">{{ filtriAttivi() === 1 ? '1 attivo' : filtriAttivi() + ' attivi' }}</span> }</div>
      <div class="filtri-body" [hidden]="!filtriAperti()">
        <div class="grid-filtri">
          <div class="f c2"><label>Anno di acquisto</label><input type="number" placeholder="Tutti" [value]="anno() ?? ''" (change)="anno.set(numeroOppureNull($event)); pagina.set(0)"></div>
          <div class="f c2"><label>Codice da – a</label><div class="coppia">
            <input placeholder="da" [value]="codDa()" (input)="codDa.set(testo($event)); pagina.set(0)"><input placeholder="a" [value]="codA()" (input)="codA.set(testo($event)); pagina.set(0)"></div></div>
          <div class="f c2"><label>Senza costo</label><label class="switch"><input type="checkbox" [checked]="senzaCosto()" (change)="senzaCosto.set(spuntato($event)); pagina.set(0)"><span></span></label></div>
          <div class="f c2"><label title="Anche gli articoli che questa sede non ha mai avuto (giacenza 0)">Anche senza giacenza</label><label class="switch"><input type="checkbox" [checked]="tutti()" (change)="tutti.set(spuntato($event)); pagina.set(0)"><span></span></label></div>
          <div class="f c3"><label>Categoria</label><select (change)="categoria.set(testo($event)); pagina.set(0)"><option value="">Tutte</option>
            @for (c of categorie; track c.cod) { <option [value]="c.cod" [selected]="c.cod === categoria()">{{ c.cod }} – {{ c.descr }}</option> }</select></div>
        </div>
        <div class="filtri-azioni"><button class="btn btn-ghost" (click)="azzera()">Azzera filtri</button></div>
      </div>
    </section>

    <section class="panel">
      <div class="toolbar">
        <div class="tool-group"><button title="Aggiorna" (click)="ricarica()">↻</button></div>
        <div class="cerca"><input type="search" placeholder="Cerca codice, descrizione o barcode…" [value]="cerca()" (input)="cerca.set(testo($event)); pagina.set(0)"></div>
      </div>
      @if (errore()) { <div class="avviso-accesso">⚠ {{ errore() }}</div> }
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th class="sort" (click)="ordina('codice')">Articolo</th><th>Anni</th><th class="num sort" (click)="ordina('costo')">Costo</th>
            <th class="num">Q. iniz.</th><th class="num sort" (click)="ordina('q')">Q. attuale</th><th class="num sort" (click)="ordina('valore')">Valore</th>
            <th>In ordine</th><th class="sort" (click)="ordina('barcode')">Barcode</th>
          </tr></thead>
          <tbody>
            @for (g of righe(); track g.articolo_id) {
              <tr class="cliccabile" (click)="apri(g)" [title]="'Apri ' + g.codice">
                <td><span class="codice">{{ g.codice }}</span> {{ g.descrizione }}</td>
                <td><div class="anni">@for (a of g.anni; track a.anno) { <span class="anno-chip" [title]="'Pezzi acquistati nel ' + a.anno"><b>{{ a.anno }}</b> {{ quantita(toNumber(a.q)) }}</span> } @empty { <span class="anno-chip">–</span> }</div></td>
                <td class="num">@if (toNumber(g.costo)) { {{ numero(toNumber(g.costo)) }} } @else { <span style="color:var(--ko)" title="Costo mancante">—</span> }</td>
                <td class="num">{{ quantita(toNumber(g.q_iniziale)) }}</td>
                <td class="num"><span class="q" [class]="'q ' + statoQ(g)" [title]="'Scorta minima: ' + g.scorta">{{ quantita(toNumber(g.q_attuale)) }}</span></td>
                <td class="num valore">{{ toNumber(g.q_attuale) > 0 && toNumber(g.costo) ? numero(toNumber(g.q_attuale) * toNumber(g.costo)) : '' }}</td>
                <td>@if (toNumber(g.forn)) { <span class="ord forn" title="Ordinato e non ancora arrivato">Forn {{ quantita(toNumber(g.forn)) }}</span> }
                    @if (toNumber(g.cli)) { <span class="ord cli" title="Prenotato dai clienti">Cli {{ quantita(toNumber(g.cli)) }}</span> }
                    @if (!toNumber(g.forn) && !toNumber(g.cli)) { <span class="ord">0</span> }</td>
                <td><span class="barcode">{{ g.barcode }}</span></td>
              </tr>
            } @empty {
              <tr><td colspan="8"><div class="vuoto"><b>{{ caricamento() ? 'Lettura delle giacenze…' : 'Nessun articolo con questi filtri' }}</b>@if (!caricamento()) { <span>Prova a cambiare o azzerare i filtri.</span> }</div></td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="piede">
        <div class="totali"><span>Articoli: <b>{{ totale() }}</b></span><span>Pezzi: <b>{{ quantita(conteggi()?.pezzi ?? 0) }}</b></span><span>Valore a costo: <b>{{ euro(conteggi()?.valore ?? 0) }}</b></span></div>
        <app-paginatore [pagina]="pagina()" [perPagina]="perPagina()" [totale]="totale()" [caricamento]="caricamento()" (paginaCambiata)="pagina.set($event)" (perPaginaCambiata)="perPagina.set($event); pagina.set(0)" />
      </div>
    </section>
  `,
  styles: `
    tr.cliccabile { cursor: pointer; }
    .anni { display: flex; flex-direction: column; gap: 2px; }
    .anno-chip { font-family: "JetBrains Mono", monospace; font-size: 0.74rem; background: #f1f4f9; border-radius: 6px; padding: 1px 6px; width: max-content; }
    .q { display: inline-block; min-width: 34px; text-align: center; border-radius: 6px; padding: 2px 8px; font-weight: 700; }
    .q.ok { background: #ddf5e8; color: var(--ok); } .q.scorta { background: #fff3dd; color: var(--warn); }
    .q.zero { background: #eef1f6; color: var(--muted); } .q.neg { background: #fde4e4; color: var(--ko); }
    .ord { display: inline-block; font-size: 0.74rem; border-radius: 6px; padding: 1px 6px; margin-right: 4px; background: #eef1f6; color: var(--muted); }
    .ord.forn { background: #e3efff; color: var(--accent); } .ord.cli { background: #f3e8ff; color: #7c3aed; }
    .barcode { font-family: "JetBrains Mono", monospace; font-size: 0.74rem; color: var(--muted); }
    .valore { color: var(--muted); }
    .coppia { display: flex; gap: 6px; } .coppia input { min-width: 0; }
  `
})
export class Giacenze {
  protected readonly sede = inject(SedeService);
  private readonly supabase = inject(SupabaseService);
  private readonly avvisi = inject(AvvisiService);
  private readonly router = inject(Router);
  protected readonly schede = SCHEDE;
  protected readonly categorie = CATEGORIE;
  protected readonly cerca = signal('');
  protected readonly scheda = signal<Scheda>('');
  protected readonly tutti = signal(false);
  protected readonly senzaCosto = signal(false);
  protected readonly categoria = signal('');
  protected readonly codDa = signal('');
  protected readonly codA = signal('');
  protected readonly anno = signal<number | null>(null);
  protected readonly ordine = signal<{ colonna: string; crescente: boolean }>({ colonna: 'codice', crescente: true });
  protected readonly filtriAperti = signal(true);
  protected readonly pagina = signal(0);
  protected readonly perPagina = signal(25);
  protected readonly righe = signal<GiacenzaElencoRiga[]>([]);
  protected readonly totale = signal(0);
  protected readonly conteggi = signal<Conteggi | null>(null);
  protected readonly caricamento = signal(false);
  protected readonly errore = signal<string | null>(null);
  protected readonly filtriAttivi = computed(() => [this.codDa(), this.codA(), this.categoria(), this.anno()].filter(v => v !== '' && v !== null).length
    + (this.senzaCosto() ? 1 : 0) + (this.tutti() ? 1 : 0));
  protected readonly numero = numero;
  protected readonly euro = euro;
  protected readonly quantita = quantita;
  protected readonly toNumber = toNumber;
  private richiesta = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const filtri = this.filtri();
      const extra = { scheda: this.scheda(), ordine: this.ordine(), pagina: this.pagina(), per: this.perPagina() };
      untracked(() => { clearTimeout(this.timer); this.timer = setTimeout(() => void this.carica(filtri, extra), 250); });
    });
  }

  private filtri(): GiacenzeArgs {
    return { p_sede: this.sede.sedeId() ?? '', p_cerca: this.cerca().trim() || null, p_tutti: this.tutti(), p_senza_costo: this.senzaCosto(),
      p_categoria: this.categoria() || null, p_cod_da: this.codDa().trim() || null, p_cod_a: this.codA().trim() || null, p_anno: this.anno() };
  }

  private async carica(f: GiacenzeArgs, x: { scheda: Scheda; ordine: { colonna: string; crescente: boolean }; pagina: number; per: number }): Promise<void> {
    if (!f.p_sede) return;
    const mia = ++this.richiesta;
    this.caricamento.set(true);
    this.errore.set(null);
    try {
      const [righe, riep] = await Promise.all([
        this.supabase.rpc('giacenze_elenco', { ...f, p_scheda: x.scheda, p_ordina: x.ordine.colonna, p_crescente: x.ordine.crescente, p_da: x.pagina * x.per, p_quanti: x.per }),
        this.supabase.rpc('giacenze_riepilogo', f)
      ]);
      if (mia !== this.richiesta) return;
      this.righe.set(righe);
      this.totale.set(righe.length ? toNumber(righe[0].righe_totali) : 0);
      const r = riep[0];
      this.conteggi.set(r ? { tutti: toNumber(r.tutti), disp: toNumber(r.disp), scorta: toNumber(r.scorta), zero: toNumber(r.zero), neg: toNumber(r.neg),
        pezzi: toNumber(r.pezzi), valore: toNumber(r.valore) } : null);
    } catch (e) {
      if (mia === this.richiesta) this.errore.set(e instanceof Error ? e.message : String(e));
    } finally {
      if (mia === this.richiesta) this.caricamento.set(false);
    }
  }

  protected numeroScheda(k: Scheda): number { const c = this.conteggi(); return c ? c[k === '' ? 'tutti' : k] : 0; }
  protected statoQ(g: GiacenzaElencoRiga): string {
    const q = toNumber(g.q_attuale);
    return q < 0 ? 'neg' : q === 0 ? 'zero' : q <= g.scorta ? 'scorta' : 'ok';
  }
  protected ordina(colonna: string): void {
    const o = this.ordine();
    this.ordine.set({ colonna, crescente: o.colonna === colonna ? !o.crescente : true });
    this.pagina.set(0);
  }
  protected azzera(): void {
    this.codDa.set(''); this.codA.set(''); this.categoria.set(''); this.anno.set(null); this.senzaCosto.set(false); this.tutti.set(false); this.pagina.set(0);
  }
  protected ricarica(): void { void this.carica(this.filtri(), { scheda: this.scheda(), ordine: this.ordine(), pagina: this.pagina(), per: this.perPagina() }).then(() => this.avvisi.mostra('Elenco aggiornato')); }
  protected testo(e: Event): string { return (e.target as HTMLInputElement).value; }
  protected spuntato(e: Event): boolean { return (e.target as HTMLInputElement).checked; }
  protected numeroOppureNull(e: Event): number | null { const v = (e.target as HTMLInputElement).value; return v ? Number(v) : null; }
  protected apri(g: GiacenzaElencoRiga): void { void this.router.navigate(['/articoli', g.codice]); }

  /** Excel (.xlsx, come il prototipo): tutte le righe con i filtri scelti, lette a blocchi dal database. */
  protected async esporta(): Promise<void> {
    this.avvisi.mostra("Preparo l'Excel delle giacenze…");
    try {
      const tutte: GiacenzaElencoRiga[] = [];
      for (let da = 0; da < 20000; da += 500) {
        const r = await this.supabase.rpc('giacenze_elenco', { ...this.filtri(), p_scheda: this.scheda(), p_ordina: 'codice', p_crescente: true, p_da: da, p_quanti: 500 });
        tutte.push(...r);
        if (r.length < 500) break;
      }
      const nome = `${(this.sede.sede()?.nome ?? 'sede').replace(/\s+/g, '_')}_Giacenze_${new Date().toLocaleDateString('sv-SE')}`;
      const intestazione: Cella[] = ['Codice', 'Descrizione', 'Costo', 'Q. iniziale', 'Q. attuale', 'Valore', 'Ordinato fornitori', 'Ordinato clienti', 'Barcode'];
      tabellaExcel(nome, 'Giacenze', [intestazione]
        .concat(tutte.map((g): Cella[] => {
          const q = toNumber(g.q_attuale), costo = toNumber(g.costo);
          return [g.codice, g.descrizione, costo, toNumber(g.q_iniziale), q, Math.round(Math.max(0, q) * costo * 100) / 100, toNumber(g.forn), toNumber(g.cli), g.barcode ?? ''];
        })));
    } catch (e) { this.avvisi.errore(e); }
  }
}
