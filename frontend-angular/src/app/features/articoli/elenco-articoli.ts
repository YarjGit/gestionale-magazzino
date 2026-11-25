import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import type { ArticoliElencoArgs, ArticoloElencoRiga, OrdinaArticoli, SchedaArticoli } from '../../core/models/database.types';
import { toNumber } from '../../core/models/database.types';
import { SedeService } from '../../core/services/sede.service';
import { AvvisiService } from '../../shared/avvisi.service';
import { CercaFornitore } from '../../shared/cerca-fornitore';
import { esportaCsv } from '../../shared/csv';
import { numero, quantita } from '../../shared/formato';
import { Paginatore } from '../../shared/paginatore';
import { FornitoriSedeService, type FornitoreBreve } from '../fornitori/fornitori-sede.service';
import { ArticoliService } from './articoli.service';

interface Filtri {
  fornitore: string | null;
  codDa: string;
  codA: string;
  cod: string;
  anno: string;
  prezzoMin: string;
  prezzoMax: string;
  iva: string;
  soloGiacenza: boolean;
}
const FILTRI_VUOTI: Filtri = { fornitore: null, codDa: '', codA: '', cod: '', anno: '', prezzoMin: '', prezzoMax: '', iva: '', soloGiacenza: false };

/**
 * Elenco Articoli (prototipo/articoli.html): filtri, schede per giacenza, ricerca, ordinamento, selezione per le etichette.
 * Differenza voluta: tutto avviene nel database, una pagina alla volta (mai l'intero catalogo in memoria).
 */
@Component({
  selector: 'app-elenco-articoli',
  imports: [FormsModule, Paginatore, CercaFornitore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './elenco-articoli.html',
  styles: `
    td.chk, th.chk { width: 34px; text-align: center; }
    td.chk input, th.chk input { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
    .descr { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
    .giac { display: inline-block; min-width: 34px; padding: 2px 8px; border-radius: 6px; font-weight: 700; text-align: center; }
    .giac.ok { background: #ddf5e8; color: #13804a; } .giac.poca { background: #fff3dd; color: #b26a00; }
    .giac.zero { background: #f1f3f7; color: var(--muted); } .giac.neg { background: #fde4e4; color: var(--ko); }
    .prezzi .costo { color: var(--muted); font-size: 0.8rem; } .prezzi .prezzo { font-weight: 700; }
    tr.cliccabile { cursor: pointer; }
    .barra-sel { display: flex; gap: 10px; align-items: center; margin: 0 0 10px; padding: 8px 12px; border-radius: 9px; background: #eef5ff; }
  `
})
export class ElencoArticoli {
  private readonly servizio = inject(ArticoliService);
  private readonly fornitoriSede = inject(FornitoriSedeService);
  private readonly sede = inject(SedeService);
  private readonly avvisi = inject(AvvisiService);
  private readonly router = inject(Router);

  protected readonly filtri = signal<Filtri>({ ...FILTRI_VUOTI });
  protected readonly cerca = signal('');
  protected readonly scheda = signal<SchedaArticoli>('');
  protected readonly ordina = signal<{ k: OrdinaArticoli; crescente: boolean }>({ k: 'codice', crescente: true });
  protected readonly pagina = signal(0);
  protected readonly perPagina = signal(25);
  protected readonly filtriAperti = signal(true);

  protected readonly righe = signal<ArticoloElencoRiga[]>([]);
  protected readonly totale = signal(0);
  protected readonly conteggi = signal({ tutti: 0, disponibili: 0, esauriti: 0, negativi: 0 });
  protected readonly caricamento = signal(false);
  protected readonly errore = signal<string | null>(null);
  protected readonly fornitori = signal<FornitoreBreve[]>([]);
  protected readonly selezionati = signal<Set<string>>(new Set());

  protected readonly numero = numero;
  protected readonly quantita = quantita;
  protected readonly toNumber = toNumber;
  protected readonly nFiltri = computed(() => {
    const f = this.filtri();
    return [f.fornitore, f.codDa, f.codA, f.cod, f.anno, f.prezzoMin, f.prezzoMax, f.iva].filter(Boolean).length + (f.soloGiacenza ? 1 : 0);
  });
  protected readonly schede: { k: SchedaArticoli; t: string; colore?: string; n: () => number }[] = [
    { k: '', t: 'Tutti', n: () => this.conteggi().tutti },
    { k: 'disp', t: 'Disponibili', colore: '#18a058', n: () => this.conteggi().disponibili },
    { k: 'esauriti', t: 'Esauriti', colore: '#94a3b8', n: () => this.conteggi().esauriti },
    { k: 'neg', t: 'Negativi', colore: '#c62828', n: () => this.conteggi().negativi }
  ];
  protected readonly colonne: { k: OrdinaArticoli | null; t: string; num?: boolean }[] = [
    { k: 'codice', t: 'Codice' }, { k: 'descrizione', t: 'Descrizione' }, { k: 'giacenza', t: 'Giacenza', num: true },
    { k: 'prezzo', t: 'Costo / Prezzo', num: true }, { k: null, t: 'Ricarico', num: true }, { k: 'barcode', t: 'Barcode' }, { k: 'iva', t: 'IVA', num: true }
  ];
  protected readonly tuttiSelezionati = computed(() => this.righe().length > 0 && this.righe().every(r => this.selezionati().has(r.codice)));

  private richiesta = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const sede = this.sede.sedeId();
    if (sede) {
      this.fornitoriSede.elenco(sede).then(f => this.fornitori.set(f)).catch(e => this.avvisi.errore(e));
      this.servizio.conteggi(sede).then(c => this.conteggi.set(c)).catch(() => { /* i conteggi non bloccano l'elenco */ });
    }
    // ogni cambio di filtri, ricerca, scheda, ordine o pagina → nuova pagina dal database (con una piccola attesa mentre si scrive)
    effect(() => {
      const args = this.argomenti();
      untracked(() => {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.carica(args), 250);
      });
    });
  }

  private argomenti(): ArticoliElencoArgs {
    const f = this.filtri();
    const n = (s: string): number | null => (s.trim() === '' ? null : Number(s.replace(',', '.')));
    // la ricerca e "Codice, nome o barcode" sono due ricerche che devono valere insieme: si uniscono le parole
    const cerca = [this.cerca(), f.cod].map(s => s.trim()).filter(Boolean).join(' ');
    return {
      p_sede: this.sede.sedeId() ?? '', p_cerca: cerca || null, p_fornitore: f.fornitore, p_cod_da: f.codDa || null, p_cod_a: f.codA || null,
      p_anno: n(f.anno), p_prezzo_min: n(f.prezzoMin), p_prezzo_max: n(f.prezzoMax), p_iva: n(f.iva), p_scheda: this.scheda(),
      p_solo_giacenza: f.soloGiacenza, p_ordina: this.ordina().k, p_crescente: this.ordina().crescente,
      p_da: this.pagina() * this.perPagina(), p_quanti: this.perPagina()
    };
  }

  private async carica(args: ArticoliElencoArgs): Promise<void> {
    const mia = ++this.richiesta;
    this.caricamento.set(true);
    this.errore.set(null);
    try {
      const p = await this.servizio.pagina(args);
      if (mia !== this.richiesta) return;   // nel frattempo è partita una richiesta più nuova
      this.righe.set(p.righe);
      this.totale.set(p.totale);
    } catch (e) {
      if (mia === this.richiesta) this.errore.set(e instanceof Error ? e.message : String(e));
    } finally {
      if (mia === this.richiesta) this.caricamento.set(false);
    }
  }

  // ---------- Azioni ----------
  protected cambiaFiltro<K extends keyof Filtri>(k: K, v: Filtri[K]): void {
    this.filtri.update(f => ({ ...f, [k]: v }));
    this.pagina.set(0);
  }
  protected testo(e: Event): string { return (e.target as HTMLInputElement).value; }
  protected spuntato(e: Event): boolean { return (e.target as HTMLInputElement).checked; }
  protected azzera(): void { this.filtri.set({ ...FILTRI_VUOTI }); this.pagina.set(0); }
  protected scegliScheda(k: SchedaArticoli): void { this.scheda.set(k); this.pagina.set(0); }
  protected ordinaPer(k: OrdinaArticoli | null): void {
    if (!k) return;
    const o = this.ordina();
    this.ordina.set({ k, crescente: o.k === k ? !o.crescente : true });
  }
  protected cercaCambiata(v: string): void { this.cerca.set(v); this.pagina.set(0); }
  protected aggiorna(): void { void this.carica(this.argomenti()).then(() => this.avvisi.mostra('Elenco aggiornato')); }

  protected classeGiac(q: ArticoloElencoRiga['quantita']): string {
    if (q == null) return 'zero';
    const g = toNumber(q);
    return g < 0 ? 'neg' : g === 0 ? 'zero' : g <= 2 ? 'poca' : 'ok';
  }
  protected ricarico(r: ArticoloElencoRiga): string {
    const c = toNumber(r.costo_netto);
    return c ? '×' + (toNumber(r.prezzo_vendita_ivato) / c).toLocaleString('it-IT', { maximumFractionDigits: 1 }) : '–';
  }

  protected seleziona(codice: string, si: boolean): void {
    const s = new Set(this.selezionati());
    if (si) s.add(codice); else s.delete(codice);
    this.selezionati.set(s);
  }
  protected selezionaPagina(si: boolean): void {
    const s = new Set(this.selezionati());
    this.righe().forEach(r => (si ? s.add(r.codice) : s.delete(r.codice)));
    this.selezionati.set(s);
  }
  protected togliSelezione(): void { this.selezionati.set(new Set()); }
  protected apri(r: ArticoloElencoRiga, e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('input, button')) return;
    void this.router.navigate(['/articoli', r.codice]);
  }
  protected nuovo(): void { void this.router.navigate(['/articoli', 'nuovo']); }
  protected etichette(): void {
    const cod = [...this.selezionati()];
    void this.router.navigate(['/etichette'], { queryParams: cod.length ? { cod } : { da: 'articoli' } });
  }
  protected async esporta(): Promise<void> {
    try {
      this.avvisi.mostra('Preparo il file…');
      const tutte = await this.servizio.tutte(this.argomenti());
      esportaCsv('articoli', [['Codice', 'Descrizione', 'Giacenza', 'Costo', 'Prezzo', 'Barcode', 'IVA']].concat(
        tutte.map(a => [a.codice, a.descrizione, a.quantita == null ? '' : quantita(toNumber(a.quantita)), numero(toNumber(a.costo_netto)),
          numero(toNumber(a.prezzo_vendita_ivato)), a.barcode ?? '', `${toNumber(a.iva)}%`])));
    } catch (e) {
      this.avvisi.errore(e);
    }
  }
}
