import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import type { GiacenzaSedeRiga, RpcFunzioni } from '../../core/models/database.types';
import { toNumber } from '../../core/models/database.types';
import { SedeService } from '../../core/services/sede.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { AvvisiService } from '../../shared/avvisi.service';
import { esportaCsv } from '../../shared/csv';
import { numero, quantita } from '../../shared/formato';
import { Paginatore } from '../../shared/paginatore';

/**
 * Giacenze della sede di lavoro (nel prototipo giacenze.html è ancora solo grafica): una pagina alla volta dalla funzione
 * giacenze_sede del database, con ricerca, "solo con giacenza" e "sotto scorta". I lotti per anno sono nella scheda articolo.
 */
@Component({
  selector: 'app-giacenze',
  imports: [Paginatore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head">
      <div><h1 class="page-title">Giacenze</h1><div class="crumbs"><span>Magazzino</span><span>-</span><span>Giacenze</span><span>-</span><span>{{ sede.sede()?.nome }}</span></div></div>
    </div>
    <section class="panel">
      <div class="toolbar">
        <div class="tool-group"><button title="Aggiorna" (click)="ricarica()">↻</button><button title="Esporta per Excel" (click)="esporta()">⤓</button></div>
        <label class="interr"><span class="switch"><input type="checkbox" [checked]="soloPresenti()" (change)="soloPresenti.set(spuntato($event)); pagina.set(0)"><span></span></span> Solo con giacenza</label>
        <label class="interr"><span class="switch"><input type="checkbox" [checked]="sottoScorta()" (change)="sottoScorta.set(spuntato($event)); pagina.set(0)"><span></span></span> Sotto scorta</label>
        <div class="cerca"><input type="search" placeholder="Cerca codice, descrizione o barcode…" [value]="cerca()" (input)="cerca.set(testo($event)); pagina.set(0)"></div>
      </div>
      @if (errore()) { <div class="avviso-accesso">⚠ {{ errore() }}</div> }
      <div class="table-wrap">
        <table>
          <thead><tr><th>Codice</th><th>Descrizione</th><th class="num">Giacenza</th><th class="num">Scorta minima</th><th class="num">Costo</th><th class="num">Prezzo</th><th>Barcode</th></tr></thead>
          <tbody>
            @for (g of righe(); track g.articolo_id) {
              <tr class="cliccabile" (click)="apri(g)">
                <td><span class="codice">{{ g.codice }}</span></td>
                <td>{{ g.descrizione }}</td>
                <td class="num"><b [style.color]="toNumber(g.quantita) < 0 ? 'var(--ko)' : toNumber(g.quantita) < g.scorta_minima ? 'var(--warn)' : ''">{{ quantita(toNumber(g.quantita)) }}</b></td>
                <td class="num">{{ g.scorta_minima || '–' }}</td>
                <td class="num">{{ numero(toNumber(g.costo_netto)) }}</td>
                <td class="num">{{ numero(toNumber(g.prezzo_vendita_ivato)) }}</td>
                <td><span class="barcode">{{ g.barcode }}</span></td>
              </tr>
            } @empty {
              <tr><td colspan="7"><div class="vuoto"><b>{{ caricamento() ? 'Caricamento…' : 'Nessun articolo con questi filtri' }}</b></div></td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="piede">
        <div class="totali"><span>Articoli: <b>{{ totale() }}</b></span></div>
        <app-paginatore [pagina]="pagina()" [perPagina]="perPagina()" [totale]="totale()" [caricamento]="caricamento()" (paginaCambiata)="pagina.set($event)" (perPaginaCambiata)="perPagina.set($event); pagina.set(0)" />
      </div>
    </section>
  `,
  styles: `tr.cliccabile { cursor: pointer; }`
})
export class Giacenze {
  protected readonly sede = inject(SedeService);
  private readonly supabase = inject(SupabaseService);
  private readonly avvisi = inject(AvvisiService);
  private readonly router = inject(Router);
  protected readonly cerca = signal('');
  protected readonly soloPresenti = signal(true);
  protected readonly sottoScorta = signal(false);
  protected readonly pagina = signal(0);
  protected readonly perPagina = signal(50);
  protected readonly righe = signal<GiacenzaSedeRiga[]>([]);
  protected readonly totale = signal(0);
  protected readonly caricamento = signal(false);
  protected readonly errore = signal<string | null>(null);
  protected readonly numero = numero;
  protected readonly quantita = quantita;
  protected readonly toNumber = toNumber;
  private richiesta = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const args = this.argomenti();
      untracked(() => { clearTimeout(this.timer); this.timer = setTimeout(() => void this.carica(args), 250); });
    });
  }

  private argomenti(): RpcFunzioni['giacenze_sede']['args'] {
    return { p_sede: this.sede.sedeId() ?? '', p_cerca: this.cerca().trim() || null, p_solo_presenti: this.soloPresenti(),
      p_sotto_scorta: this.sottoScorta(), p_da: this.pagina() * this.perPagina(), p_quanti: this.perPagina() };
  }

  private async carica(args: RpcFunzioni['giacenze_sede']['args']): Promise<void> {
    const mia = ++this.richiesta;
    this.caricamento.set(true);
    this.errore.set(null);
    try {
      const righe = await this.supabase.rpc('giacenze_sede', args);
      if (mia !== this.richiesta) return;
      this.righe.set(righe);
      this.totale.set(righe.length ? toNumber(righe[0].totale) : 0);
    } catch (e) {
      if (mia === this.richiesta) this.errore.set(e instanceof Error ? e.message : String(e));
    } finally {
      if (mia === this.richiesta) this.caricamento.set(false);
    }
  }

  protected ricarica(): void { void this.carica(this.argomenti()).then(() => this.avvisi.mostra('Elenco aggiornato')); }
  protected testo(e: Event): string { return (e.target as HTMLInputElement).value; }
  protected spuntato(e: Event): boolean { return (e.target as HTMLInputElement).checked; }
  protected apri(g: GiacenzaSedeRiga): void { void this.router.navigate(['/articoli', g.codice]); }

  protected async esporta(): Promise<void> {
    try {
      const tutte: GiacenzaSedeRiga[] = [];
      for (let da = 0; da < 20000; da += 200) {
        const r = await this.supabase.rpc('giacenze_sede', { p_sede: this.sede.sedeId() ?? '', p_cerca: this.cerca().trim() || null,
          p_solo_presenti: this.soloPresenti(), p_sotto_scorta: this.sottoScorta(), p_da: da, p_quanti: 200 });
        tutte.push(...r);
        if (r.length < 200) break;
      }
      esportaCsv(`giacenze-${this.sede.sedeId()}`, [['Codice', 'Descrizione', 'Giacenza', 'Scorta minima', 'Costo', 'Prezzo', 'Barcode']]
        .concat(tutte.map(g => [g.codice, g.descrizione, quantita(toNumber(g.quantita)), String(g.scorta_minima), numero(toNumber(g.costo_netto)), numero(toNumber(g.prezzo_vendita_ivato)), g.barcode ?? ''])));
    } catch (e) { this.avvisi.errore(e); }
  }
}
