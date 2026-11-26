import { Injectable } from '@angular/core';
import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import type { NomeRpc, Pagina, RpcFunzioni } from '../models/database.types';
import { anteprimaAttiva, fetchFinto } from '../anteprima/anteprima';

/** Errore del database con il messaggio già tradotto per l'utente. */
export class ErroreDatabase extends Error {
  readonly codice: string;
  readonly originale: string;

  constructor(errore: PostgrestError | Error) {
    const testo = errore.message ?? String(errore);
    super(messaggioPerUtente(testo));
    this.name = 'ErroreDatabase';
    this.codice = 'code' in errore && typeof errore.code === 'string' ? errore.code : '';
    this.originale = testo;
  }
}

/** Traduce gli errori noti delle funzioni del database (database/27, 28) in italiano semplice. */
export function messaggioPerUtente(testo: string): string {
  if (testo.startsWith('CONFLITTO|')) {
    const [, chi] = testo.split('|');
    return `Nel frattempo questa scheda è stata modificata da ${chi ?? 'un altro computer'}: ricarica la pagina.`;
  }
  if (testo.startsWith('GIORNATA_ESISTE|')) return 'La giornata di vendite di oggi esiste già: aggiungi gli articoli a quella.';
  if (testo.startsWith('ORDINE_GIA_PREPARATO|')) return `Questo ordine è già stato preparato: ${testo.split('|')[1] ?? ''}`.trim();
  if (testo.startsWith('Giacenza insufficiente')) return testo;
  if (/non autorizzato/i.test(testo)) return 'Questo utente non è autorizzato: chiedi all\'amministratore.';
  if (/Failed to fetch|NetworkError/i.test(testo)) return 'Connessione assente: controlla internet e riprova.';
  if (/JWT expired|invalid JWT|refresh token/i.test(testo)) return "La sessione è scaduta: entra di nuovo (in un'altra scheda, se stai modificando qualcosa) e riprova.";
  if (/duplicate key/i.test(testo)) return 'Questo dato esiste già (codice o numero doppio): controlla e riprova.';
  if (/violates check constraint "trasferimento_non_a_se_stessa"/.test(testo)) return 'Un trasferimento non può andare verso la stessa sede che lo manda.';
  if (/Utente non autorizzato a scrivere in questa sede|SEDE_NON_TUA/.test(testo)) return 'Puoi guardare i dati delle altre sedi, ma modificare solo quelli della tua sede.';
  return testo;
}

export interface OpzioniPagina {
  /** Colonne da leggere (sintassi PostgREST, anche con relazioni). */
  select: string;
  pagina: number;
  perPagina: number;
  ordina?: { colonna: string; crescente?: boolean };
  /** Ricerca lato server: testo cercato con ilike su queste colonne (OR). */
  cerca?: { testo: string; colonne: string[] };
  /** Filtri di uguaglianza (colonna → valore). */
  filtri?: Record<string, string | number | boolean | null>;
  /** Condizioni PostgREST in più, ognuna messa in .or() (es. 'partita_iva.is.null,partita_iva.eq.'); tra loro valgono tutte. */
  condizioni?: string[];
}

/**
 * Unico punto di accesso a Supabase.
 * Le SCRITTURE passano solo da `rpc()` (regola in frontend-angular/CLAUDE.md); le letture lunghe da `pagina()`.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    // solo sviluppo: risposte finte per vedere le schermate senza accesso (core/anteprima)
    ...(anteprimaAttiva() ? { global: { fetch: fetchFinto } } : {})
  });

  /** Chiama una funzione del database tipizzata (transazioni e controlli stanno lì). */
  async rpc<N extends NomeRpc>(nome: N, args: RpcFunzioni[N]['args']): Promise<RpcFunzioni[N]['ritorno']> {
    const { data, error } = await this.client.rpc(nome, args);
    if (error) throw new ErroreDatabase(error);
    return data as RpcFunzioni[N]['ritorno'];
  }

  /**
   * Come rpc() per le funzioni che restituiscono tante righe: il database ne manda al massimo 1000 per volta,
   * quindi si leggono a blocchi finché arrivano tutte (es. giacenza_per_anno per gli Excel dell'inventario).
   */
  async rpcTutte<N extends NomeRpc>(nome: N, args: RpcFunzioni[N]['args']): Promise<RpcFunzioni[N]['ritorno']> {
    const tutte: unknown[] = [];
    for (let da = 0; ; da += 1000) {
      const { data, error } = await this.client.rpc(nome, args).range(da, da + 999);
      if (error) throw new ErroreDatabase(error);
      const blocco = (data ?? []) as unknown[];
      tutte.push(...blocco);
      if (blocco.length < 1000) break;
    }
    return tutte as RpcFunzioni[N]['ritorno'];
  }

  /** Legge una pagina di una tabella o vista con conteggio, ordinamento, filtri e ricerca lato server. */
  async pagina<T>(tabella: string, o: OpzioniPagina): Promise<Pagina<T>> {
    const da = o.pagina * o.perPagina;
    let q = this.client.from(tabella).select(o.select, { count: 'exact' });
    for (const [colonna, valore] of Object.entries(o.filtri ?? {})) {
      q = valore === null ? q.is(colonna, null) : q.eq(colonna, valore);
    }
    for (const c of o.condizioni ?? []) q = q.or(c);
    // ricerca a parole: ognuna deve comparire (anche a metà) in almeno una delle colonne
    // (virgole e parentesi rompono la sintassi di .or(): si tolgono dal testo cercato)
    const parole = (o.cerca?.testo ?? '').replace(/[,()%*]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6);
    for (const p of parole) q = q.or((o.cerca?.colonne ?? []).map(c => `${c}.ilike.%${p}%`).join(','));
    if (o.ordina) q = q.order(o.ordina.colonna, { ascending: o.ordina.crescente ?? true });
    const { data, error, count } = await q.range(da, da + o.perPagina - 1);
    if (error) throw new ErroreDatabase(error);
    return { righe: (data ?? []) as T[], totale: count ?? 0, pagina: o.pagina, perPagina: o.perPagina };
  }

  /** Conta le righe con questi filtri senza leggerle (numeri delle schede in alto). */
  async conta(tabella: string, filtri: Record<string, string | number | boolean | null> = {}, condizioni: string[] = [], select = 'codice'): Promise<number> {
    let q = this.client.from(tabella).select(select, { count: 'exact', head: true });
    for (const [colonna, valore] of Object.entries(filtri)) q = valore === null ? q.is(colonna, null) : q.eq(colonna, valore);
    for (const c of condizioni) q = q.or(c);
    const { count, error } = await q;
    if (error) throw new ErroreDatabase(error);
    return count ?? 0;
  }
}
