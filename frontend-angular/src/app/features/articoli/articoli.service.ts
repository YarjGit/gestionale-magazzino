import { inject, Injectable } from '@angular/core';
import type { ArticoliElencoArgs, ArticoloElencoRiga, Pagina, SedeId } from '../../core/models/database.types';
import { toNumber } from '../../core/models/database.types';
import { SupabaseService } from '../../core/services/supabase.service';

/** Dati dell'elenco Articoli: sempre una pagina alla volta, filtri e ricerca nel database (RPC articoli_elenco). */
@Injectable({ providedIn: 'root' })
export class ArticoliService {
  private readonly supabase = inject(SupabaseService);

  async pagina(args: ArticoliElencoArgs): Promise<Pagina<ArticoloElencoRiga>> {
    const righe = await this.supabase.rpc('articoli_elenco', args);
    return { righe, totale: righe.length ? toNumber(righe[0].totale) : 0, pagina: Math.floor(args.p_da / args.p_quanti), perPagina: args.p_quanti };
  }

  async conteggi(sede: SedeId): Promise<{ tutti: number; disponibili: number; esauriti: number; negativi: number }> {
    const [c] = await this.supabase.rpc('articoli_conteggi', { p_sede: sede });
    return { tutti: toNumber(c?.tutti), disponibili: toNumber(c?.disponibili), esauriti: toNumber(c?.esauriti), negativi: toNumber(c?.negativi) };
  }

  /** Per l'esportazione: tutte le righe filtrate, lette a blocchi di 500 (mai l'intera tabella in una richiesta). */
  async tutte(args: ArticoliElencoArgs, max = 20000): Promise<ArticoloElencoRiga[]> {
    const tutte: ArticoloElencoRiga[] = [];
    for (let da = 0; da < max; da += 500) {
      const righe = await this.supabase.rpc('articoli_elenco', { ...args, p_da: da, p_quanti: 500 });
      tutte.push(...righe);
      if (righe.length < 500) break;
    }
    return tutte;
  }
}
