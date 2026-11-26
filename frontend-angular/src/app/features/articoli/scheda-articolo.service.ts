import { inject, Injectable } from '@angular/core';
import type { Articolo, LottoArticolo, MovimentoArticolo, PrevistoSede, RegistroAttivita, SedeId } from '../../core/models/database.types';
import { ErroreDatabase, SupabaseService } from '../../core/services/supabase.service';

/** Articolo letto per la scheda, con la percentuale IVA della sua aliquota. */
export type ArticoloScheda = Articolo & { aliquote_iva: { aliquota: number | string } | null };

/**
 * Dati della scheda articolo (prototipo/articolo.html). Si legge con query mirate (un articolo, le sue righe calcolate dal
 * database); si scrive SOLO con la funzione salva_articolo (database/33), che controlla la versione e crea il barcode.
 */
@Injectable({ providedIn: 'root' })
export class SchedaArticoloService {
  private readonly supabase = inject(SupabaseService);

  async leggi(codice: string): Promise<ArticoloScheda | null> {
    const { data, error } = await this.supabase.client.from('articoli').select('*, aliquote_iva(aliquota)').eq('codice', codice).maybeSingle();
    if (error) throw new ErroreDatabase(error);
    return (data as ArticoloScheda | null) ?? null;
  }

  lotti(articolo: string, sede: SedeId): Promise<LottoArticolo[]> {
    return this.supabase.rpc('articolo_lotti', { p_articolo: articolo, p_sede: sede });
  }

  previsto(articolo: string): Promise<PrevistoSede[]> {
    return this.supabase.rpc('articolo_previsto', { p_articolo: articolo });
  }

  movimenti(articolo: string, sede: SedeId, da: number, quanti: number): Promise<MovimentoArticolo[]> {
    return this.supabase.rpc('articolo_movimenti', { p_articolo: articolo, p_sede: sede, p_da: da, p_quanti: quanti });
  }

  /** Storico modifiche: le righe del registro attività di questo articolo (scritte dal trigger del database). */
  async storico(codice: string): Promise<RegistroAttivita[]> {
    const { data, error } = await this.supabase.client.from('registro_attivita').select('*')
      .eq('tabella', 'articoli').eq('riferimento', codice).order('quando', { ascending: false }).limit(100);
    if (error) throw new ErroreDatabase(error);
    return (data ?? []) as RegistroAttivita[];
  }

  simili(codice: string | null, barcode: string | null, escludi: string | null): Promise<{ codice: string; descrizione: string; motivo: 'codice' | 'barcode' }[]> {
    return this.supabase.rpc('articoli_simili', { p_codice: codice, p_barcode: barcode, p_escludi: escludi });
  }

  salva(id: string | null, dati: Partial<Articolo>, versione: string | null): Promise<string> {
    return this.supabase.rpc('salva_articolo', { p_id: id, p_dati: dati, p_versione: versione });
  }
}
