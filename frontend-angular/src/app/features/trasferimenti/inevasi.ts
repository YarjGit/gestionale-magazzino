import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { InevasoDettaglio, InevasoInAttesa } from '../../core/models/database.types';
import { toNumber } from '../../core/models/database.types';
import { SedeService } from '../../core/services/sede.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { AvvisiService } from '../../shared/avvisi.service';
import { dataIt } from '../../shared/formato';
import { MovimentiService } from '../movimenti/movimenti.service';

interface OrdineInev<T> { id: number; data: string; sede: string; filiale: string; righe: T[]; pezzi: number; disp: number }
type Annullato = { id: number; annullato_il: string; annullato_da: string | null; quantita: number | string; motivo: string | null; ordine_id: number; codice: string; descrizione: string; filiale: string | null };

/**
 * Inevasi (prototipo/inevasi.html): articoli ordinati da una filiale e non ancora mandati = ordinata − trasferita − cancellata.
 *  - "Da mandare": ordini delle filiali verso questa sede con inevasi (un ordine per riga) → /trasferimenti/inevasi?filiale=…&ordine=N
 *    dettaglio della filiale diviso per data dell'ordine: si spuntano e si prepara il trasferimento, o si cancellano (con motivo).
 *  - "In attesa per noi": quello che questa sede ha ordinato e non è ancora arrivato (da non riordinare).
 *  - "Cancellati": registro di chi, quando, quanti pezzi e perché.
 * Tutto dal database (inevasi_dettaglio, inevasi_in_attesa, inevasi_annullati_sede); la cancellazione con annulla_inevaso.
 */
@Component({
  selector: 'app-inevasi',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inevasi.html',
  styleUrl: './inevasi.css'
})
export class Inevasi {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  private readonly mov = inject(MovimentiService);
  private readonly avvisi = inject(AvvisiService);
  protected readonly sede = inject(SedeService);
  protected readonly dataIt = dataIt;
  protected readonly toNumber = toNumber;

  protected readonly tab = signal<'mandare' | 'attesa' | 'cancellati'>('mandare');
  protected readonly filiale = signal<string | null>(null);
  protected readonly ordineScelto = signal<number | null>(null);
  protected readonly daMandare = signal<InevasoDettaglio[]>([]);
  protected readonly inAttesa = signal<InevasoInAttesa[]>([]);
  protected readonly annullati = signal<Annullato[]>([]);
  protected readonly scelti = signal<Set<number>>(new Set());
  protected readonly caricamento = signal(true);
  protected readonly errore = signal<string | null>(null);
  protected readonly cancella = signal<{ r: InevasoDettaglio; quanti: string; motivo: string } | null>(null);
  protected readonly lavoro = signal(false);

  protected readonly ordiniMandare = computed(() => this.perOrdine(this.daMandare()).sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id));
  protected readonly righeFiliale = computed(() => this.daMandare().filter(r => r.sede_richiedente === this.filiale()));
  protected readonly ordiniFiliale = computed(() => this.perOrdine(this.righeFiliale()).sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id));
  protected readonly nomeFiliale = computed(() => this.righeFiliale()[0]?.nome_richiedente ?? this.sede.sedi().find(s => s.id === this.filiale())?.nome ?? this.filiale() ?? '');
  protected readonly ordiniAttesa = computed(() => {
    const m = new Map<number, OrdineInev<InevasoInAttesa>>();
    this.inAttesa().forEach(r => {
      const o = m.get(r.ordine_id) ?? { id: r.ordine_id, data: r.data_ordine, sede: r.sede, filiale: r.sede, righe: [], pezzi: 0, disp: 0 };
      o.righe.push(r); o.pezzi += toNumber(r.residuo);
      m.set(r.ordine_id, o);
    });
    return [...m.values()].sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
  });
  protected readonly articoliAttesa = computed(() => new Set(this.inAttesa().map(r => r.articolo_id)).size);
  protected readonly selezione = computed(() => {
    const l = this.daMandare().filter(r => this.scelti().has(r.ordine_riga_id));
    return { n: l.length, pezzi: this.c(l.reduce((s, r) => s + toNumber(r.residuo), 0)) };
  });

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    this.filiale.set(q.get('filiale'));
    this.ordineScelto.set(Number(q.get('ordine')) || null);
    void this.carica(q.get('vista') === 'attesa');
  }

  protected c(v: number): number { return Math.round(v * 100) / 100; }
  private perOrdine(lista: InevasoDettaglio[]): OrdineInev<InevasoDettaglio>[] {
    const m = new Map<number, OrdineInev<InevasoDettaglio>>();
    lista.forEach(r => {
      const o = m.get(r.ordine_id) ?? { id: r.ordine_id, data: r.data_ordine, sede: r.sede_richiedente, filiale: r.nome_richiedente, righe: [], pezzi: 0, disp: 0 };
      o.righe.push(r); o.pezzi += toNumber(r.residuo);
      if (toNumber(r.giacenza) > 0) o.disp++;
      m.set(r.ordine_id, o);
    });
    return [...m.values()];
  }

  private async carica(vistaAttesa = false): Promise<void> {
    const s = this.sede.sedeId() ?? '';
    try {
      await this.sede.caricaSedi();
      const [mandare, attesa, canc] = await Promise.all([
        this.supabase.rpc('inevasi_dettaglio', { p_sede_fornitrice: s, p_ordine: null, p_righe: null, p_richiedente: null, p_solo_evasi: true }),
        this.supabase.rpc('inevasi_in_attesa', { p_sede: s }),
        this.supabase.rpc('inevasi_annullati_sede', { p_sede: s })
      ]);
      this.daMandare.set(mandare);
      this.inAttesa.set(attesa);
      this.annullati.set(canc);
      // una sede che non riceve ordini si apre su "In attesa per noi"
      if (vistaAttesa || (!mandare.length && attesa.length)) this.tab.set('attesa');
      if (this.ordineScelto()) setTimeout(() => document.getElementById('ord-' + this.ordineScelto())?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    } catch (e) {
      this.errore.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.caricamento.set(false);
    }
  }

  protected disponibilita(r: InevasoDettaglio): { cls: string; testo: string } {
    const g = toNumber(r.giacenza), res = toNumber(r.residuo);
    return g >= res ? { cls: 'si', testo: 'disponibile' } : g > 0 ? { cls: 'parte', testo: `solo ${g}` } : { cls: 'no', testo: "non c'è" };
  }
  protected coloreSede(nome: string): string { return this.sede.sedi().find(s => s.nome === nome)?.colore ?? '#e5e7eb'; }
  protected apriOrdine(o: OrdineInev<InevasoDettaglio>): void {
    void this.router.navigate(['/trasferimenti/inevasi'], { queryParams: { filiale: o.sede, ordine: o.id } }).then(() => { this.filiale.set(o.sede); this.ordineScelto.set(o.id); this.scelti.set(new Set()); });
  }
  protected tuttiGliOrdini(): void { void this.router.navigate(['/trasferimenti/inevasi']).then(() => { this.filiale.set(null); this.ordineScelto.set(null); }); }

  // ---------- Selezione ----------
  protected spunta(id: number, si: boolean): void { this.scelti.update(s => { const n = new Set(s); if (si) n.add(id); else n.delete(id); return n; }); }
  protected spuntaOrdine(o: OrdineInev<InevasoDettaglio>, si: boolean): void { this.scelti.update(s => { const n = new Set(s); o.righe.forEach(r => (si ? n.add(r.ordine_riga_id) : n.delete(r.ordine_riga_id))); return n; }); }
  protected tuttoOrdine(o: OrdineInev<InevasoDettaglio>): boolean { return o.righe.length > 0 && o.righe.every(r => this.scelti().has(r.ordine_riga_id)); }
  protected selezionaDisponibili(): void { this.scelti.set(new Set(this.righeFiliale().filter(r => toNumber(r.giacenza) > 0).map(r => r.ordine_riga_id))); }
  protected togliSelezione(): void { this.scelti.set(new Set()); }
  protected preparaTrasferimento(): void {
    const righe = [...this.scelti()];
    if (!righe.length) { this.avvisi.mostra('Seleziona gli inevasi da mandare (o usa "Seleziona i disponibili")'); return; }
    void this.router.navigate(['/trasferimento', 'nuovo'], { queryParams: { righe: righe.join(',') } });
  }
  protected spuntato(e: Event): boolean { return (e.target as HTMLInputElement).checked; }
  protected testo(e: Event): string { return (e.target as HTMLInputElement).value; }

  // ---------- Cancellazione: resta registrato chi, quando, quanti pezzi e perché ----------
  protected chiediCancella(r: InevasoDettaglio): void { this.cancella.set({ r, quanti: String(toNumber(r.residuo)), motivo: 'Non più disponibile' }); }
  protected async confermaCancella(): Promise<void> {
    const c = this.cancella();
    if (!c || this.lavoro()) return;
    const res = toNumber(c.r.residuo);
    const quanti = Math.min(res, Math.max(0, Number(c.quanti.replace(',', '.')) || 0));
    if (!quanti) { this.avvisi.mostra('Scrivi quanti pezzi cancellare', true); return; }
    if (!c.motivo.trim()) { this.avvisi.mostra('Scrivi il motivo: resta registrato', true); return; }
    this.lavoro.set(true);
    try {
      await this.mov.annullaInevaso(c.r.ordine_riga_id, quanti, c.motivo.trim());
      this.avvisi.mostra(`Inevaso cancellato: ${quanti} pezzi di ${c.r.codice}. Resta registrato in "Cancellati".`);
      this.cancella.set(null);
      this.scelti.update(s => { const n = new Set(s); n.delete(c.r.ordine_riga_id); return n; });
      await this.carica();
    } catch (e) { this.avvisi.errore(e); }
    finally { this.lavoro.set(false); }
  }
  protected aggiornaCancella(k: 'quanti' | 'motivo', v: string): void { this.cancella.update(c => (c ? { ...c, [k]: v } : c)); }
  protected oraIt(iso: string): string { const d = new Date(iso); return `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`; }
}
