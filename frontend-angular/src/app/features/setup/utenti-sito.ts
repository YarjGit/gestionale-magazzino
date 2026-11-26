import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { Ruolo, UtenteAutorizzato } from '../../core/models/database.types';
import { AuthService } from '../../core/services/auth.service';
import { SedeService } from '../../core/services/sede.service';
import { ErroreDatabase, SupabaseService } from '../../core/services/supabase.service';
import { AvvisiService } from '../../shared/avvisi.service';

const RUOLI: [string, string, string, string, string][] = [
  ['amministratore', 'Amministratore', '#7c3aed', '#f3e8ff', 'gestisce utenti e impostazioni'],
  ['responsabile_magazzino', 'Responsabile magazzino', '#1f5fbf', '#e8f1ff', 'movimenti, ordini, anagrafiche, conferma inventario'],
  ['operatore', 'Operatore', '#13804a', '#e6f6ec', 'lavoro di tutti i giorni in sede'],
  ['traduttore', 'Traduttore', '#b26a00', '#fff3dd', 'testi e traduzioni'],
  ['diagnostica', 'Diagnostica / sistema', '#475569', '#eef2f7', 'controlli tecnici']
];
const COLORI = ['#2f8bff', '#7c3aed', '#18a058', '#e58a00', '#0891b2', '#db2777', '#64748b'];
interface Riga { email: string; nome: string; ruoli: string[]; sedi: string[]; bloccato: boolean; ultimo: string }
interface Modulo { email: string; nome: string; ruoli: Set<string>; sedi: Set<string>; bloccato: boolean; nuovo: boolean }

/**
 * Utenti Sito (prototipo/utenti-sito.html): chi può entrare nel gestionale (utenti_autorizzati). Si entra con il link alla mail.
 * Solo gli amministratori modificano (salva_utente: nessuno può togliersi da solo il ruolo di amministratore o bloccarsi).
 * Gli utenti sono pochi: l'elenco si legge tutto insieme.
 */
@Component({
  selector: 'app-utenti-sito',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './utenti-sito.html',
  styles: `
    .utente { display: flex; align-items: center; gap: 8px; font-weight: 600; }
    .iniziali { flex: none; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; color: #fff; font-size: 0.72rem; font-weight: 700; }
    .ruolo { display: inline-block; margin: 1px 4px 1px 0; padding: 2px 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 600; }
    .bloccato { color: var(--ko); font-weight: 700; } .attivo { color: var(--ok); font-weight: 700; }
    .ultimo { font-size: 0.8rem; color: var(--muted); }
    tr.cliccabile { cursor: pointer; }
    .scelte { display: flex; flex-wrap: wrap; gap: 6px; }
    .scelte label { display: inline-flex; align-items: center; gap: 6px; padding: 6px 11px; border: 1px solid var(--line); border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
    .scelte label:has(input:checked) { background: #e8f1ff; border-color: #9cc2f5; color: #1f5fbf; }
    .scelte small { display: block; font-weight: 400; color: var(--muted); font-size: 0.72rem; }
    .solo-lettura { margin-bottom: 12px; padding: 10px 14px; border-radius: 10px; background: #fff7ed; border: 1px solid #f5c58a; color: #9a4b00; font-size: 0.86rem; }
  `
})
export class UtentiSito {
  private readonly supabase = inject(SupabaseService);
  private readonly avvisi = inject(AvvisiService);
  private readonly auth = inject(AuthService);
  protected readonly sede = inject(SedeService);
  protected readonly RUOLI = RUOLI;
  protected readonly elenco = signal<Riga[]>([]);
  protected readonly cerca = signal('');
  protected readonly scheda = signal<'' | 'adm' | 'att' | 'blo'>('');
  protected readonly caricamento = signal(true);
  protected readonly errore = signal<string | null>(null);
  protected readonly modulo = signal<Modulo | null>(null);
  protected readonly salvataggio = signal(false);
  protected readonly admin = computed(() => this.auth.amministratore());

  protected readonly visibili = computed(() => {
    const parole = this.cerca().toLowerCase().split(/\s+/).filter(Boolean), s = this.scheda();
    return this.elenco().filter(r => (s === '' || (s === 'adm' && r.ruoli.includes('amministratore')) || (s === 'att' && !r.bloccato) || (s === 'blo' && r.bloccato))
      && parole.every(p => `${r.nome} ${r.email} ${r.ruoli.join(' ')}`.toLowerCase().includes(p)));
  });
  protected readonly conteggi = computed(() => ({ tutti: this.elenco().length, adm: this.elenco().filter(r => r.ruoli.includes('amministratore')).length,
    att: this.elenco().filter(r => !r.bloccato).length, blo: this.elenco().filter(r => r.bloccato).length }));

  constructor() { void this.carica(); }

  private async carica(): Promise<void> {
    try {
      await this.sede.caricaSedi();
      const { data, error } = await this.supabase.client.from('utenti_autorizzati').select('*').order('email');
      if (error) throw new ErroreDatabase(error);
      const ultimo = new Map<string, string>();
      const { data: acc } = await this.supabase.client.from('registro_attivita').select('email, quando').eq('attivita', 'Accesso').order('quando', { ascending: false }).limit(2000);
      ((acc ?? []) as { email: string | null; quando: string }[]).forEach(a => { const k = (a.email ?? '').toLowerCase(); if (!ultimo.has(k)) ultimo.set(k, a.quando); });
      this.elenco.set(((data ?? []) as UtenteAutorizzato[]).map(u => ({ email: u.email, nome: u.nome ?? '', ruoli: u.ruoli?.length ? u.ruoli : ['operatore'],
        sedi: u.sedi ?? [], bloccato: !!u.bloccato, ultimo: ultimo.get(u.email.toLowerCase()) ?? '' })));
    } catch (e) {
      this.errore.set('Non riesco a leggere gli utenti: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      this.caricamento.set(false);
    }
  }

  protected ruolo(k: string): [string, string, string, string, string] { return RUOLI.find(r => r[0] === k) ?? [k, k, '#475569', '#eef2f7', '']; }
  protected colore(s: string): string { return COLORI[[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORI.length]; }
  protected iniziali(r: Riga): string { return (r.nome.trim() || r.email.split('@')[0]).split(/[\s._-]+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase(); }
  protected nomiSedi(r: Riga): string { return r.sedi.map(s => this.sede.sedi().find(x => x.id === s)?.nome ?? s).join(', '); }
  protected data(iso: string): string { return iso ? new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : 'mai'; }
  protected testo(e: Event): string { return (e.target as HTMLInputElement).value; }
  protected spuntato(e: Event): boolean { return (e.target as HTMLInputElement).checked; }
  protected sediScelta(m: Modulo): { id: string; nome: string }[] { return this.sede.sedi().filter(s => s.attiva || m.sedi.has(s.id)); }

  protected apri(r: Riga | null): void {
    if (!this.admin()) { this.avvisi.mostra('Solo un amministratore può aggiungere o modificare gli utenti'); return; }
    this.modulo.set({ email: r?.email ?? '', nome: r?.nome ?? '', ruoli: new Set(r?.ruoli ?? ['operatore']), sedi: new Set(r?.sedi ?? []), bloccato: r?.bloccato ?? false, nuovo: !r });
  }
  protected imposta<K extends 'email' | 'nome' | 'bloccato'>(k: K, v: Modulo[K]): void { this.modulo.update(m => (m ? { ...m, [k]: v } : m)); }
  protected spunta(k: 'ruoli' | 'sedi', v: string, si: boolean): void {
    this.modulo.update(m => { if (!m) return m; const s = new Set(m[k]); if (si) s.add(v); else s.delete(v); return { ...m, [k]: s }; });
  }

  protected async salva(): Promise<void> {
    const m = this.modulo();
    if (!m || this.salvataggio()) return;
    const email = m.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { this.avvisi.mostra('Scrivi una mail valida', true); return; }
    if (!m.ruoli.size) { this.avvisi.mostra('Scegli almeno un ruolo', true); return; }
    if (email === (this.auth.email() ?? '').toLowerCase() && (!m.ruoli.has('amministratore') || m.bloccato)) {
      this.avvisi.mostra('Non puoi togliere a te stesso il ruolo di amministratore né bloccarti: chiedi a un altro amministratore', true); return;
    }
    if (m.nuovo && this.elenco().some(r => r.email.toLowerCase() === email)) { this.avvisi.mostra("Questa mail c'è già nell'elenco: aprila per modificarla", true); return; }
    this.salvataggio.set(true);
    try {
      await this.supabase.rpc('salva_utente', { p_email: email, p_dati: { nome: m.nome.trim() || null, ruoli: [...m.ruoli] as Ruolo[], sedi: [...m.sedi], bloccato: m.bloccato }, p_nuovo: m.nuovo });
      this.avvisi.mostra(m.nuovo ? `Utente ${email} aggiunto: ora può entrare con il link che riceve a quella mail` : `Utente ${email} aggiornato`);
      this.modulo.set(null);
      await this.carica();
    } catch (e) { this.avvisi.errore(e); }
    finally { this.salvataggio.set(false); }
  }
}
