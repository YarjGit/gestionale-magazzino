import { inject, Injectable } from '@angular/core';
import type { Cliente, Fornitore, Movimento, MovimentoDaSalvare, MovimentoRiga, RigaDaSalvare, SedeId } from '../../core/models/database.types';
import { toNumber } from '../../core/models/database.types';
import { ErroreDatabase, SupabaseService } from '../../core/services/supabase.service';
import { cent } from '../../shared/formato';
import type { ArticoloRiga, RigaMovimento } from '../../shared/righe-movimento';

/** Movimento letto con le sue righe (articolo con la giacenza della sede di lavoro). */
export interface MovimentoLetto {
  mov: Movimento & { fornitori: Pick<Fornitore, 'id' | 'codice' | 'ragione_sociale' | 'sede_collegata'> | null; clienti: Cliente | null };
  righe: (RigaMovimento & { id: number; quantitaContata: number | null; azione: 'elimina' | null })[];
}

type ArticoloDb = { id: string; codice: string; descrizione: string; barcode: string | null; fornitore_id: string | null; costo_netto: number | string;
  prezzo_vendita_ivato: number | string; anno_listino: number | null; unita_misura: string | null; aliquote_iva: { aliquota: number | string } | null };
type RigaDb = Pick<MovimentoRiga, 'id' | 'quantita' | 'quantita_ordinata' | 'ordine_riga_id' | 'prezzo' | 'sconto' | 'etichette' | 'aggiunto_il' | 'quantita_contata' | 'azione'> & { articoli: ArticoloDb };

export const articoloDaDb = (a: ArticoloDb, giacenza: number | null): ArticoloRiga => ({
  id: a.id, codice: a.codice, descrizione: a.descrizione, barcode: a.barcode, fornitore_id: a.fornitore_id, costo: cent(toNumber(a.costo_netto)),
  prezzo: cent(toNumber(a.prezzo_vendita_ivato)), iva: a.aliquote_iva ? toNumber(a.aliquote_iva.aliquota) : 22, anno: a.anno_listino, unita: a.unita_misura,
  giacenza, giacenzaAltra: null, altroFornitore: false
});
export const CAMPI_ARTICOLO = 'id, codice, descrizione, barcode, fornitore_id, costo_netto, prezzo_vendita_ivato, anno_listino, unita_misura, aliquote_iva(aliquota)';

/**
 * Movimenti: lettura di uno (con righe e giacenze) e TUTTE le scritture tramite funzioni del database:
 * salva_movimento (tutto o niente, versione, giacenza mai sotto zero, numero di bolla), salva_carico, salva_movimento_ed_evadi,
 * conferma_ricezione, annulla_movimento, aggiorna_documento_movimento, scala_ordine_cliente, conferma_inventario, annulla_inevaso.
 */
@Injectable({ providedIn: 'root' })
export class MovimentiService {
  private readonly supabase = inject(SupabaseService);

  async leggi(id: number, sede: SedeId): Promise<MovimentoLetto | null> {
    const { data, error } = await this.supabase.client.from('movimenti')
      .select(`*, fornitori(id, codice, ragione_sociale, sede_collegata), clienti(*), movimenti_righe(id, quantita, quantita_ordinata, ordine_riga_id, prezzo, sconto, etichette, aggiunto_il, quantita_contata, azione, articoli(${CAMPI_ARTICOLO}))`)
      .eq('id', id).maybeSingle();
    if (error) throw new ErroreDatabase(error);
    if (!data) return null;
    const m = data as MovimentoLetto['mov'] & { movimenti_righe: RigaDb[] };
    const ids = [...new Set(m.movimenti_righe.map(r => r.articoli.id))];
    const giac = new Map<string, number>();
    if (ids.length) (await this.supabase.rpc('giacenze_articoli', { p_sede: sede, p_articoli: ids })).forEach(g => giac.set(g.articolo_id, toNumber(g.quantita)));
    const righe = m.movimenti_righe.sort((a, b) => a.id - b.id).map((r, i) => {
      const q = toNumber(r.quantita);
      return {
        id: r.id, pos: i + 1, articolo: articoloDaDb(r.articoli, giac.get(r.articoli.id) ?? null), qta: r.quantita_ordinata != null ? toNumber(r.quantita_ordinata) : q, sped: q,
        prezzo: toNumber(r.prezzo), sconto: toNumber(r.sconto), iva: '22', etichette: r.etichette ?? q, etichetteMan: (r.etichette ?? q) !== q,
        ordinata: r.quantita_ordinata == null ? null : toNumber(r.quantita_ordinata), ordineRigaId: r.ordine_riga_id, oltreAttesa: false,
        ora: r.aggiunto_il ?? m.creato_il, giaScaricati: 0, quantitaContata: r.quantita_contata == null ? null : toNumber(r.quantita_contata), azione: r.azione
      };
    });
    const { movimenti_righe: _, ...mov } = m;
    return { mov, righe };
  }

  /** Articoli già con la giacenza della sede (per riempire righe da un ordine). */
  async articoli(ids: string[], sede: SedeId): Promise<Map<string, ArticoloRiga>> {
    const mappa = new Map<string, ArticoloRiga>();
    if (!ids.length) return mappa;
    const [{ data, error }, giac] = await Promise.all([
      this.supabase.client.from('articoli').select(CAMPI_ARTICOLO).in('id', ids),
      this.supabase.rpc('giacenze_articoli', { p_sede: sede, p_articoli: ids })
    ]);
    if (error) throw new ErroreDatabase(error);
    const g = new Map(giac.map(x => [x.articolo_id, toNumber(x.quantita)]));
    ((data ?? []) as unknown as ArticoloDb[]).forEach(a => mappa.set(a.id, articoloDaDb(a, g.get(a.id) ?? null)));
    return mappa;
  }

  /** Righe della pagina → righe per il database (solo quelle con articolo e pezzi; spedita = quantità che conta). */
  daSalvare(righe: RigaMovimento[], o: { spedita?: boolean; conOrdinata?: boolean; conOra?: boolean } = {}): RigaDaSalvare[] {
    return righe.filter(r => r.articolo && (o.spedita ? r.sped : r.qta) > 0).map(r => ({
      articolo_id: r.articolo!.id, quantita: o.spedita ? r.sped : r.qta, prezzo: r.prezzo, sconto: r.sconto || 0, etichette: r.etichette,
      quantita_ordinata: o.conOrdinata ? r.ordinata : null, ordine_riga_id: r.ordineRigaId,
      ...(o.conOra ? { aggiunto_il: r.ora } : {})
    }));
  }

  salva(id: number | null, mov: MovimentoDaSalvare, righe: RigaDaSalvare[], versione: string | null): Promise<number> {
    return this.supabase.rpc('salva_movimento', { p_id: id, p_mov: versione ? { ...mov, _versione: versione } : mov, p_righe: righe });
  }
  salvaCarico(id: number | null, mov: MovimentoDaSalvare, righe: RigaDaSalvare[], versione: string | null, ordini: number[]): Promise<number> {
    return this.supabase.rpc('salva_carico', { p_id: id, p_mov: versione ? { ...mov, _versione: versione } : mov, p_righe: righe, p_ordini: ordini });
  }
  salvaEdEvadi(id: number | null, mov: MovimentoDaSalvare, righe: RigaDaSalvare[], versione: string | null, evadi: number[]): Promise<number> {
    return this.supabase.rpc('salva_movimento_ed_evadi', { p_id: id, p_mov: versione ? { ...mov, _versione: versione } : mov, p_righe: righe, p_evadi: evadi });
  }
  confermaRicezione(id: number): Promise<null> { return this.supabase.rpc('conferma_ricezione', { p_id: id }); }
  annulla(id: number): Promise<null> { return this.supabase.rpc('annulla_movimento', { p_id: id }); }
  aggiornaDocumento(id: number, dati: Partial<Movimento>): Promise<null> { return this.supabase.rpc('aggiorna_documento_movimento', { p_id: id, p_dati: dati }); }
  scalaOrdineCliente(id: number): Promise<number> { return this.supabase.rpc('scala_ordine_cliente', { p_ordine: id }); }
  confermaInventario(id: number): Promise<{ contati: number; eliminati: number; non_disattivati: string[] }> { return this.supabase.rpc('conferma_inventario', { p_id: id }); }
  annullaInevaso(riga: number, quantita: number, motivo: string): Promise<null> { return this.supabase.rpc('annulla_inevaso', { p_riga: riga, p_quantita: quantita, p_motivo: motivo }); }

  /** Inventario in corso nella sede (riallineamento provvisorio): vendite, scarichi, diminuzioni e trasferimenti lo dicono in rosso. */
  async inventarioInCorso(sede: SedeId): Promise<{ id: number; data_movimento: string } | null> {
    const { data } = await this.supabase.client.from('movimenti').select('id, data_movimento').eq('tipo', 'riallineamento').eq('sede_id', sede).eq('stato', 'Provvisorio').limit(1);
    return ((data ?? []) as { id: number; data_movimento: string }[])[0] ?? null;
  }

  /** Storico del movimento dal registro attività (scritto dal trigger del database). */
  async storico(id: number): Promise<{ id: number; quando: string; email: string | null; attivita: string; dettagli: string | null }[]> {
    const { data, error } = await this.supabase.client.from('registro_attivita').select('id, quando, email, attivita, dettagli')
      .eq('tabella', 'movimenti').eq('riferimento', String(id)).order('quando', { ascending: false }).limit(100);
    if (error) throw new ErroreDatabase(error);
    return (data ?? []) as { id: number; quando: string; email: string | null; attivita: string; dettagli: string | null }[];
  }
}
