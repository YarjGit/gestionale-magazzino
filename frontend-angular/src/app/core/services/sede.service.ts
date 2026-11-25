import { computed, inject, Injectable, signal } from '@angular/core';
import type { Sede, SedeId } from '../models/database.types';
import { ErroreDatabase, SupabaseService } from './supabase.service';

/**
 * Sede di lavoro, come nel prototipo (js/sedi.js): vale per la singola scheda del browser (sessionStorage),
 * una scheda nuova parte dall'ultima sede scelta (localStorage). Ogni scheda lavora separata.
 */
@Injectable({ providedIn: 'root' })
export class SedeService {
  private readonly supabase = inject(SupabaseService);

  readonly sedi = signal<Sede[]>([]);
  readonly sedeId = signal<SedeId | null>(SedeService.leggi());
  readonly sede = computed(() => this.sedi().find(s => s.id === this.sedeId()) ?? null);
  readonly sediAttive = computed(() => this.sedi().filter(s => s.attiva));

  /** Le sedi sono poche (17): si leggono tutte una volta. */
  async caricaSedi(): Promise<void> {
    if (this.sedi().length) return;
    const { data, error } = await this.supabase.client.from('sedi').select('*').order('nome');
    if (error) throw new ErroreDatabase(error);
    this.sedi.set((data ?? []) as Sede[]);
  }

  scegli(id: SedeId): void {
    this.sedeId.set(id);
    try {
      sessionStorage.setItem('sede', id);
      localStorage.setItem('ultimaSede', id);
    } catch {
      /* senza memoria del browser la sede vale solo finché la pagina è aperta */
    }
  }

  private static leggi(): SedeId | null {
    try {
      let s = sessionStorage.getItem('sede');
      if (!s) {
        s = localStorage.getItem('ultimaSede');
        if (s) sessionStorage.setItem('sede', s);
      }
      return s;
    } catch {
      return null;
    }
  }
}
