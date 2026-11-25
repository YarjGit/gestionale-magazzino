import { inject, Injectable } from '@angular/core';
import type { SedeId } from '../../core/models/database.types';
import { ErroreDatabase, SupabaseService } from '../../core/services/supabase.service';

export interface FornitoreBreve { id: string; codice: string; nome: string; sede_collegata: SedeId | null }

/**
 * Fornitori usati da una sede (tabella fornitori_sedi, come soloFornitoriSede del prototipo).
 * Sono qualche centinaio in tutto: per le tendine si leggono quelli della sede, non l'intero catalogo articoli.
 * Se la sede non ha ancora fornitori collegati (script 23 non usato), si mostrano tutti.
 */
@Injectable({ providedIn: 'root' })
export class FornitoriSedeService {
  private readonly supabase = inject(SupabaseService);
  private readonly cache = new Map<string, Promise<FornitoreBreve[]>>();

  elenco(sede: SedeId, tenere: (string | null)[] = []): Promise<FornitoreBreve[]> {
    const chiave = `${sede}|${tenere.join(',')}`;
    if (!this.cache.has(chiave)) this.cache.set(chiave, this.leggi(sede, tenere));
    return this.cache.get(chiave)!;
  }

  private async leggi(sede: SedeId, tenere: (string | null)[]): Promise<FornitoreBreve[]> {
    const db = this.supabase.client;
    const { data: legami, error: e1 } = await db.from('fornitori_sedi').select('fornitore_id').eq('sede_id', sede);
    const ids = new Set((e1 ? [] : (legami ?? []) as { fornitore_id: string }[]).map(l => l.fornitore_id));
    tenere.filter((x): x is string => !!x).forEach(x => ids.add(x));
    let q = db.from('fornitori').select('id, codice, ragione_sociale, sede_collegata').order('ragione_sociale');
    if (ids.size && !e1) q = q.in('id', [...ids]);
    const { data, error } = await q;
    if (error) throw new ErroreDatabase(error);
    return ((data ?? []) as { id: string; codice: string; ragione_sociale: string; sede_collegata: SedeId | null }[])
      .map(f => ({ id: f.id, codice: f.codice, nome: f.ragione_sociale, sede_collegata: f.sede_collegata }));
  }
}
