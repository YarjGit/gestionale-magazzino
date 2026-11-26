import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Articolo, Fornitore, RegistroAttivita, SedeId } from '../../core/models/database.types';
import { toNumber } from '../../core/models/database.types';
import { ModificheService } from '../../core/services/modifiche.service';
import { SedeService } from '../../core/services/sede.service';
import { ErroreDatabase, SupabaseService } from '../../core/services/supabase.service';
import { AvvisiService } from '../../shared/avvisi.service';
import { numero } from '../../shared/formato';
import { Paginatore } from '../../shared/paginatore';

type Campo = 'codice' | 'ragione_sociale' | 'aliquota_iva' | 'partita_iva' | 'codice_fiscale' | 'sede_collegata' | 'indirizzo' | 'cap'
  | 'citta' | 'provincia' | 'nazione' | 'telefono' | 'cellulare' | 'email' | 'note';
type Valori = Record<Campo, string>;
type ArticoloFornitore = Pick<Articolo, 'codice' | 'descrizione' | 'costo_netto' | 'prezzo_vendita_ivato' | 'attivo'>;

const VUOTI: Valori = { codice: '', ragione_sociale: '', aliquota_iva: '22', partita_iva: '', codice_fiscale: '', sede_collegata: '', indirizzo: '',
  cap: '', citta: '', provincia: '', nazione: 'Italia', telefono: '', cellulare: '', email: '', note: '' };
const NAZIONI = ['Italia', 'Austria', 'Belgio', 'Cina', 'Croazia', 'Francia', 'Germania', 'India', 'Polonia', 'Portogallo', 'Regno Unito',
  'Romania', 'San Marino', 'Spagna', 'Stati Uniti', 'Svizzera', 'Città del Vaticano'];

/**
 * Scheda fornitore (prototipo/fornitore.html): Dettagli · Articoli · Storico modifiche.
 * /anagrafiche/fornitori/nuovo = nuovo, già in modifica (il codice si assegna da solo: il successivo sotto 003500);
 * si salva solo con salva_fornitore (fornitore e sedi che lo usano nella stessa transazione).
 */
@Component({
  selector: 'app-scheda-fornitore',
  imports: [Paginatore, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scheda-fornitore.html',
  styles: `
    .biglietto { padding: 14px 16px; border: 1px dashed #b9cdf0; border-radius: 12px; background: #f6f9ff; font-size: 0.86rem; line-height: 1.5; margin: 12px; }
    .biglietto b.t { display: block; margin-bottom: 4px; color: var(--muted); font-size: 0.7rem; letter-spacing: 0.06em; text-transform: uppercase; }
    .biglietto .vuoto-b { color: var(--muted); }
    .avviso-doppio { margin-top: 6px; padding: 6px 10px; border-radius: 8px; background: #fff3dd; color: #9a5a00; font-size: 0.8rem; }
    .avviso-doppio button { margin-left: 8px; padding: 3px 10px; border: none; border-radius: 6px; background: #b26a00; color: #fff; font-weight: 600; cursor: pointer; }
    .art-forn td.num { text-align: right; font-family: "JetBrains Mono", monospace; }
    textarea { min-height: 110px; }
    .scelte-sedi { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
    .scelte-sedi label { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid var(--line); border-radius: 8px; background: #fbfcfe; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
    .scelte-sedi label:has(input:checked) { background: #e8f1ff; border-color: #9cc2f5; color: #1f5fbf; }
    .azioni-scheda { display: flex; justify-content: flex-end; gap: 8px; margin: 10px 0 12px; flex-wrap: wrap; }
    a.art { color: var(--accent); }
  `
})
export class SchedaFornitore implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  private readonly avvisi = inject(AvvisiService);
  private readonly modifiche = inject(ModificheService);
  protected readonly sede = inject(SedeService);

  protected readonly NAZIONI = NAZIONI;
  protected readonly ALIQUOTE = [22, 10, 5, 4, 0];
  protected readonly numero = numero;
  protected readonly toNumber = toNumber;
  protected readonly nuovo = this.route.snapshot.routeConfig?.path === 'anagrafiche/fornitori/nuovo';
  private readonly codiceRotta = this.route.snapshot.paramMap.get('codice') ?? '';

  protected readonly fornitore = signal<Fornitore | null>(null);
  protected readonly valori = signal<Valori>({ ...VUOTI });
  protected readonly sediUsate = signal<Set<SedeId>>(new Set());
  protected readonly conSedi = signal(true);
  private prima: { valori: Valori; sedi: Set<SedeId> } | null = null;
  protected readonly inModifica = signal(this.nuovo);
  protected readonly salvataggio = signal(false);
  protected readonly caricamento = signal(!this.nuovo);
  protected readonly errore = signal<string | null>(null);
  protected readonly tab = signal<'dettagli' | 'articoli' | 'storico'>('dettagli');
  protected readonly doppio = signal<{ id: string; codice: string; ragione_sociale: string } | null>(null);

  protected readonly articoli = signal<ArticoloFornitore[] | null>(null);
  protected readonly artTotale = signal(0);
  protected readonly artPagina = signal(0);
  protected readonly artPerPagina = signal(50);
  protected readonly storico = signal<RegistroAttivita[] | null>(null);

  /** sedi da spuntare: quelle che usano il gestionale (attive), più quelle già collegate */
  protected readonly sediScelta = computed(() => this.sede.sedi().filter(s => s.attiva || this.sediUsate().has(s.id)));
  protected readonly biglietto = computed(() => {
    const v = this.valori();
    return [v.ragione_sociale.toUpperCase(), v.indirizzo, [v.cap, v.citta, v.provincia ? `(${v.provincia.toUpperCase()})` : ''].filter(Boolean).join(' '),
      v.nazione && v.nazione !== 'Italia' ? v.nazione : '', v.partita_iva ? 'P.IVA ' + v.partita_iva : '', v.telefono ? 'Tel. ' + v.telefono : '']
      .map(x => x.trim()).filter(Boolean);
  });

  constructor() {
    void this.avvia();
  }

  ngOnDestroy(): void {
    this.modifiche.imposta(false);
  }

  private async avvia(): Promise<void> {
    const db = this.supabase.client;
    try {
      await this.sede.caricaSedi();
      if (this.nuovo) {
        // il fornitore nuovo è della sede che lo crea
        const s = this.sede.sedeId();
        if (s) this.sediUsate.set(new Set([s]));
        const { error } = await db.from('fornitori_sedi').select('sede_id').limit(1);
        if (error) this.conSedi.set(false);
        this.modifiche.imposta(true);
        return;
      }
      const { data, error } = await db.from('fornitori').select('*').eq('codice', this.codiceRotta).maybeSingle();
      if (error) throw new ErroreDatabase(error);
      const f = data as Fornitore | null;
      if (!f) { this.errore.set(`Fornitore ${this.codiceRotta} non trovato`); return; }
      this.fornitore.set(f);
      this.valori.set(this.daFornitore(f));
      const { data: leg, error: e3 } = await db.from('fornitori_sedi').select('sede_id').eq('fornitore_id', f.id);
      if (e3) this.conSedi.set(false);
      else this.sediUsate.set(new Set(((leg ?? []) as { sede_id: SedeId }[]).map(l => l.sede_id)));
      void this.caricaArticoli();
    } catch (e) {
      this.errore.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.caricamento.set(false);
    }
  }

  private daFornitore(f: Fornitore): Valori {
    const t = (x: string | number | null | undefined): string => (x == null ? '' : String(x));
    return { codice: f.codice, ragione_sociale: f.ragione_sociale, aliquota_iva: String(toNumber(f.aliquota_iva ?? 22)), partita_iva: t(f.partita_iva),
      codice_fiscale: t(f.codice_fiscale), sede_collegata: t(f.sede_collegata), indirizzo: t(f.indirizzo), cap: t(f.cap), citta: t(f.citta),
      provincia: t(f.provincia), nazione: f.nazione || 'Italia', telefono: t(f.telefono), cellulare: t(f.cellulare), email: t(f.email), note: t(f.note) };
  }

  /** Articoli del fornitore (fornitore 1 o 2), una pagina alla volta. */
  protected async caricaArticoli(): Promise<void> {
    const f = this.fornitore();
    if (!f) return;
    try {
      const p = await this.supabase.pagina<ArticoloFornitore>('articoli', { select: 'codice, descrizione, costo_netto, prezzo_vendita_ivato, attivo',
        pagina: this.artPagina(), perPagina: this.artPerPagina(), ordina: { colonna: 'codice' }, condizioni: [`fornitore_id.eq.${f.id},fornitore2_id.eq.${f.id}`] });
      this.articoli.set(p.righe);
      this.artTotale.set(p.totale);
    } catch (e) { this.avvisi.errore(e); this.articoli.set([]); }
  }

  protected apriTab(t: 'dettagli' | 'articoli' | 'storico'): void {
    this.tab.set(t);
    const f = this.fornitore();
    if (t === 'storico' && f && this.storico() === null) {
      this.supabase.client.from('registro_attivita').select('*').eq('tabella', 'fornitori').eq('riferimento', f.codice).order('quando', { ascending: false }).limit(100)
        .then(({ data, error }) => { if (error) { this.avvisi.errore(new ErroreDatabase(error)); this.storico.set([]); } else this.storico.set((data ?? []) as RegistroAttivita[]); });
    }
  }

  protected cambiaPaginaArt(p: number): void { this.artPagina.set(p); void this.caricaArticoli(); }
  protected cambiaPerPaginaArt(n: number): void { this.artPerPagina.set(n); this.artPagina.set(0); void this.caricaArticoli(); }

  protected testo(e: Event): string { return (e.target as HTMLInputElement).value; }
  protected imposta(k: Campo, v: string): void { this.valori.update(x => ({ ...x, [k]: v })); }
  protected spuntaSede(id: SedeId, si: boolean): void {
    this.sediUsate.update(s => { const n = new Set(s); if (si) n.add(id); else n.delete(id); return n; });
  }
  protected spuntato(e: Event): boolean { return (e.target as HTMLInputElement).checked; }

  /** C'è già un fornitore con lo stesso nome o la stessa partita IVA? (controllo nel database) */
  protected async controllaDoppio(): Promise<{ id: string; codice: string; ragione_sociale: string } | null> {
    const v = this.valori();
    try {
      const r = await this.supabase.rpc('fornitori_doppi', { p_nome: v.ragione_sociale || null, p_piva: v.partita_iva || null, p_escludi: this.fornitore()?.id ?? null });
      this.doppio.set(r[0] ?? null);
      return r[0] ?? null;
    } catch {
      return null;   // il controllo non deve bloccare
    }
  }

  /** Fornitore che esiste già in un'altra sede: invece di un doppione si aggiunge alla sede di lavoro. */
  protected async usaAncheQui(): Promise<void> {
    const d = this.doppio(), s = this.sede.sedeId();
    if (!d || !s) return;
    try {
      await this.supabase.rpc('aggiungi_fornitore_sede', { p_fornitore: d.id, p_sede: s });
      this.avvisi.mostra(`${d.ragione_sociale} ora è anche tra i fornitori di ${this.sede.sede()?.nome}`);
      this.modifiche.imposta(false);
      void this.router.navigate(['/anagrafiche/fornitori', d.codice], { replaceUrl: true });
    } catch (e) { this.avvisi.errore(e); }
  }

  protected modifica(): void {
    this.prima = { valori: { ...this.valori() }, sedi: new Set(this.sediUsate()) };
    this.inModifica.set(true);
    this.modifiche.imposta(true);
  }

  protected annulla(): void {
    if (this.nuovo) { this.modifiche.imposta(false); void this.router.navigate(['/anagrafiche/fornitori']); return; }
    if (this.prima) { this.valori.set(this.prima.valori); this.sediUsate.set(this.prima.sedi); }
    this.doppio.set(null);
    this.inModifica.set(false);
    this.modifiche.imposta(false);
  }

  protected chiudi(): void { void this.router.navigate(['/anagrafiche/fornitori']); }

  async salva(chiudi: boolean): Promise<void> {
    if (this.salvataggio()) return;   // doppio clic
    const v = this.valori();
    const nome = v.ragione_sociale.trim().toUpperCase();
    if (!nome) { this.avvisi.mostra('Scrivi la ragione sociale', true); return; }
    const piva = v.partita_iva.trim().toUpperCase().replace(/\s/g, '');
    if (piva && (v.nazione || 'Italia') === 'Italia' && !/^(IT)?\d{11}$/.test(piva) && !confirm('La partita IVA italiana ha 11 cifre. Salvare lo stesso?')) return;
    if (this.conSedi() && !this.sediUsate().size
      && !confirm('Nessuna sede spuntata: il fornitore non comparirà nei carichi e negli ordini di nessuna sede. Salvare lo stesso?')) return;
    const email = v.email.trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { this.avvisi.mostra("L'email non sembra giusta", true); return; }
    this.salvataggio.set(true);
    try {
      const doppio = await this.controllaDoppio();
      if (doppio && !confirm(`C'è già il fornitore ${doppio.codice} · ${doppio.ragione_sociale} con lo stesso nome o la stessa partita IVA. Salvare lo stesso?`)) return;
      const n = (x: string): string | null => x.trim() || null;
      const dati: Partial<Fornitore> = {
        ragione_sociale: nome, aliquota_iva: Number(v.aliquota_iva), partita_iva: piva.replace(/^IT/, '') || null, codice_fiscale: n(v.codice_fiscale.toUpperCase()),
        indirizzo: n(v.indirizzo), cap: n(v.cap), citta: n(v.citta.toUpperCase()), provincia: n(v.provincia.toUpperCase()), nazione: n(v.nazione) ?? 'Italia',
        telefono: n(v.telefono), cellulare: n(v.cellulare), email: email || null, sede_collegata: n(v.sede_collegata), note: n(v.note)
      };
      if (this.nuovo && v.codice.trim()) dati.codice = v.codice.trim();
      await this.supabase.rpc('salva_fornitore', { p_id: this.fornitore()?.id ?? null, p_dati: dati, p_sedi: this.conSedi() ? [...this.sediUsate()] : null });
      // il codice di un fornitore nuovo lo assegna il database: lo si ritrova dal nome appena salvato
      let cod = this.fornitore()?.codice ?? dati.codice ?? '';
      if (!cod) {
        const { data } = await this.supabase.client.from('fornitori').select('codice').eq('ragione_sociale', nome).order('creato_il', { ascending: false }).limit(1);
        cod = ((data ?? []) as { codice: string }[])[0]?.codice ?? '';
      }
      this.avvisi.mostra(`Fornitore ${cod} · ${nome} salvato`);
      this.modifiche.imposta(false);
      this.inModifica.set(false);
      if (chiudi || !cod) void this.router.navigate(['/anagrafiche/fornitori']);
      else if (this.nuovo) void this.router.navigate(['/anagrafiche/fornitori', cod], { replaceUrl: true });
      else {
        const { data } = await this.supabase.client.from('fornitori').select('*').eq('codice', cod).maybeSingle();
        if (data) { this.fornitore.set(data as Fornitore); this.valori.set(this.daFornitore(data as Fornitore)); this.storico.set(null); }
      }
    } catch (e) {
      const t = e instanceof Error ? e.message : String(e);
      this.avvisi.mostra(/duplicate key|23505/.test(t) ? 'Questo codice è già usato da un altro fornitore: cambialo o lascialo vuoto' : 'Fornitore non salvato: ' + t, true);
    } finally {
      this.salvataggio.set(false);
    }
  }

  protected oraIt(iso: string): string {
    const d = new Date(iso);
    return `${d.toLocaleDateString('it-IT')} · ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
  }
}
