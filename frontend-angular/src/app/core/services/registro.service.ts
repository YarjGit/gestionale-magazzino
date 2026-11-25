import { inject, Injectable } from '@angular/core';
import { SedeService } from './sede.service';
import { SupabaseService } from './supabase.service';

/** Registro attività scritto dalla pagina (accesso, uscita, cambio sede, stampe): RPC registra_evento. Non blocca mai il lavoro. */
@Injectable({ providedIn: 'root' })
export class RegistroService {
  private readonly supabase = inject(SupabaseService);
  private readonly sede = inject(SedeService);

  async registra(attivita: string, dettagli = ''): Promise<void> {
    try {
      await this.supabase.rpc('registra_evento', {
        p_attivita: attivita,
        p_dettagli: dettagli.slice(0, 500),
        p_sede: this.sede.sede()?.nome ?? null,
        p_dispositivo: navigator.userAgent.slice(0, 200)
      });
    } catch {
      /* il registro non deve mai bloccare il lavoro (es. funzione non ancora creata su Supabase) */
    }
  }
}
