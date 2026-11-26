import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { DashboardSede, MovimentoAperto } from '../../core/models/database.types';
import { toNumber } from '../../core/models/database.types';
import { SedeService } from '../../core/services/sede.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { dataIt, euro } from '../../shared/formato';
import { percorsoMovimento } from '../../shared/percorsi-movimenti';

/**
 * Dashboard della sede (prototipo/dashboard.html): merce in arrivo da confermare, ordini delle filiali da preparare,
 * inevasi, nostri ordini in arrivo, movimenti da finire, articoli sottoscorta. Tutto calcolato dal database (dashboard_sede).
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard {
  protected readonly sede = inject(SedeService);
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  protected readonly dati = signal<DashboardSede | null>(null);
  protected readonly errore = signal<string | null>(null);
  protected readonly selezionato = signal<number | null>(null);
  protected readonly dataIt = dataIt;
  protected readonly euro = euro;
  protected readonly toNumber = toNumber;

  protected readonly statistiche = computed(() => {
    const d = this.dati();
    if (!d) return [['Ordini in arrivo', '…'], ['Movimenti aperti', '…'], ['Valore da evadere', '…'], ['Articoli sottoscorta', '…']];
    return [['Ordini in arrivo', String(d.in_arrivo.length)], ['Movimenti aperti', String(d.aperti.length)],
      ['Valore da evadere', euro(d.aperti.reduce((s, m) => s + toNumber(m.totale), 0))], ['Articoli sottoscorta', String(d.sotto_scorta)]];
  });
  /** una sede che non riceve ordini (es. un negozio) non vede la sezione */
  protected readonly conRicevuti = computed(() => {
    const d = this.dati();
    return !d || d.ricevuti.length > 0 || (d.inevasi?.articoli ?? 0) > 0;
  });

  constructor() {
    void this.carica();
  }

  private async carica(): Promise<void> {
    try {
      this.dati.set(await this.supabase.rpc('dashboard_sede', { p_sede: this.sede.sedeId() ?? '' }));
    } catch (e) {
      this.errore.set(e instanceof Error ? e.message : String(e));
    }
  }

  protected q(v: number | string): string { return (Math.round(toNumber(v) * 100) / 100).toLocaleString('it-IT'); }
  protected apriMovimento(m: MovimentoAperto): void {
    const p = percorsoMovimento(m.in_arrivo ? 'trasferimento_ricevuto' : m.tipo, m.id);
    if (p) void this.router.navigate(p);
  }
  protected vai(p: (string | number)[], query?: Record<string, string | number>): void { void this.router.navigate(p, { queryParams: query }); }
  protected esamina(e: Event): void {
    const v = (e.target as HTMLSelectElement).value;
    this.selezionato.set(v === '' ? null : Number(v));
    setTimeout(() => document.querySelector('.card.selected')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
}
