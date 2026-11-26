import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Fornitore, SedeId } from '../../core/models/database.types';
import { SedeService } from '../../core/services/sede.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { ElencoAnagrafica, type ConfigAnagrafica } from '../../shared/elenco-anagrafica';

type RigaFornitore = Pick<Fornitore, 'id' | 'codice' | 'ragione_sociale' | 'partita_iva' | 'codice_fiscale' | 'sede_collegata'> & {
  usato: { sede_id: SedeId }[] | null;
};

/**
 * Fornitori (prototipo/fornitori.html). Come nel gestionale attuale ogni sede vede il SUO elenco (tabella fornitori_sedi);
 * "Anche delle altre sedi" li mostra tutti. Se la sede non ha ancora fornitori collegati si vedono tutti.
 */
@Component({
  selector: 'app-fornitori',
  imports: [ElencoAnagrafica],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pronto()) {
      <app-elenco-anagrafica [config]="config()" (apri)="apri($event)" (crea)="nuovo()">
        @if (sedeHaElenco()) {
          <button class="btn btn-light" title="Mostra anche i fornitori usati dalle altre sedi" (click)="tutti.set(!tutti())">{{ tutti() ? 'Solo di questa sede' : 'Anche delle altre sedi' }}</button>
        }
      </app-elenco-anagrafica>
    }
  `
})
export class Fornitori {
  private readonly router = inject(Router);
  private readonly sede = inject(SedeService);
  private readonly supabase = inject(SupabaseService);
  protected readonly tutti = signal(false);
  protected readonly sedeHaElenco = signal(false);
  protected readonly pronto = signal(false);

  private readonly nomeSede = (id: string | null): string => this.sede.sedi().find(s => s.id === id)?.nome ?? id ?? '';

  protected readonly config = computed<ConfigAnagrafica<RigaFornitore>>(() => {
    const soloSede = this.sedeHaElenco() && !this.tutti();
    const filtriBase: Record<string, string> = soloSede ? { 'mie.sede_id': this.sede.sedeId() ?? '' } : {};
    return {
      titolo: 'Fornitori', sezione: 'Configurazione', tabella: 'fornitori', csv: 'fornitori', nuovo: 'Nuovo fornitore',
      // "mie" (inner) tiene solo i fornitori della sede; "usato" porta tutte le sedi che usano il fornitore
      select: 'id, codice, ragione_sociale, partita_iva, codice_fiscale, sede_collegata, usato:fornitori_sedi(sede_id)' + (soloSede ? ', mie:fornitori_sedi!inner(sede_id)' : ''),
      filtriBase,
      cercaIn: ['ragione_sociale', 'codice', 'partita_iva', 'codice_fiscale'],
      ordine: { colonna: 'ragione_sociale', crescente: true },
      schede: [
        { k: 'piva', t: 'Con P.IVA', colore: '#18a058', condizioni: ['partita_iva.neq.'] },
        { k: 'nopiva', t: 'Senza P.IVA', colore: '#e58a00', condizioni: ['partita_iva.is.null,partita_iva.eq.'] },
        { k: 'sede', t: 'Collegati a una sede', colore: '#2f8bff', condizioni: ['sede_collegata.not.is.null'] }
      ],
      colonne: [
        { t: 'Ragione sociale', valore: r => r.ragione_sociale, ordina: 'ragione_sociale', link: true, larg: 380 },
        { t: 'Partita IVA', valore: r => r.partita_iva ?? '', ordina: 'partita_iva' },
        { t: 'Codice fiscale', valore: r => r.codice_fiscale ?? '' },
        { t: 'Codice', valore: r => r.codice, ordina: 'codice' },
        { t: 'Sede collegata', valore: r => this.nomeSede(r.sede_collegata), larg: 200 },
        { t: 'Usato da', valore: r => (r.usato ?? []).map(u => this.nomeSede(u.sede_id)).join(', '), larg: 260 }
      ],
      vuoto: 'Usa "Nuovo fornitore" in alto per aggiungere il primo.'
    };
  });

  constructor() {
    void this.avvia();
  }

  private async avvia(): Promise<void> {
    try {
      await this.sede.caricaSedi();
      const n = await this.supabase.conta('fornitori_sedi', { sede_id: this.sede.sedeId() }, [], 'sede_id');
      this.sedeHaElenco.set(n > 0);
    } catch {
      this.sedeHaElenco.set(false);   // tabella fornitori_sedi non ancora creata: si vedono tutti
    } finally {
      this.pronto.set(true);
    }
  }

  protected apri(r: RigaFornitore): void { void this.router.navigate(['/anagrafiche/fornitori', r.codice]); }
  protected nuovo(): void { void this.router.navigate(['/anagrafiche/fornitori/nuovo']); }
}
