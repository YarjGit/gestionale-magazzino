import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { MovimentoDaSalvare, RigaDaSalvare } from '../../core/models/database.types';
import { toNumber } from '../../core/models/database.types';
import { SupabaseService } from '../../core/services/supabase.service';
import { dataIt, leggiNumero } from '../../shared/formato';
import { salvaPerStampa } from '../../shared/intestazioni';
import { articoloDaRicerca, type ArticoloRiga } from '../../shared/righe-movimento';
import { SchedaBase } from '../../shared/scheda-movimento';
import { MovimentiService } from './movimenti.service';

interface Contato { articolo: ArticoloRiga; contati: number; diff: number; pos: number }
type NonSparato = { id: string; codice: string; descrizione: string; barcode: string | null; costo_netto: number | string; giacenza: number | string };
type Scelta = 'lascia' | 'modifica' | 'elimina';

/**
 * Inventario (riallineamento giacenza, prototipo/riallineamento.html; database/31): tutto il magazzino o solo una parte.
 * Si sparano i pezzi (ogni sparo +1; per quantità alte si scrive il numero). In corso = Provvisorio (quantita 0 e quantita_contata:
 * la giacenza non cambia), si può salvare e continuare un altro giorno. Inventario di tutto il magazzino: gli articoli con giacenza
 * non sparati → Lascia / Modifica (scrivi i pezzi) / Elimina (giacenza a zero e articolo disattivato se le altre sedi non ne hanno).
 * La conferma la fa il database (conferma_inventario: differenze calcolate con la giacenza vera di quel momento, solo
 * amministratore o responsabile magazzino): la giacenza diventa quella contata, tutta sull'anno in corso.
 */
@Component({
  selector: 'app-inventario',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inventario.html',
  styleUrl: './inventario.css'
})
export class Inventario extends SchedaBase {
  private readonly mov = inject(MovimentiService);
  private readonly supabase = inject(SupabaseService);
  protected readonly dataIt = dataIt;
  protected readonly annoOggi = new Date().getFullYear();

  protected readonly statoSalvato = signal<string | null>(null);
  protected readonly dataInv = signal(this.oggi);
  protected readonly annoInv = signal<number | null>(null);
  protected readonly ambito = signal<'' | 'tutto' | 'parte'>('');
  protected readonly note = signal('');
  protected readonly contati = signal<Contato[]>([]);
  protected readonly scelte = signal<Map<string, Scelta>>(new Map());
  protected readonly eliminati = signal<{ codice: string; descrizione: string }[]>([]);
  protected readonly ultimo = signal<string | null>(null);
  protected readonly quanti = signal(1);
  protected readonly trovati = signal<ArticoloRiga[]>([]);
  protected readonly attivo = signal(0);
  protected readonly ns = signal<NonSparato[]>([]);
  protected readonly nsTotale = signal(0);
  protected readonly nsPagina = signal(0);
  private pos = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly confermato = computed(() => this.statoSalvato() === 'Definitivo');
  protected readonly annullato = computed(() => this.statoSalvato() === 'Annullato');
  protected readonly inCorso = computed(() => !this.confermato() && !this.annullato());
  protected readonly ordinati = computed(() => this.contati().slice().sort((a, b) => b.pos - a.pos));
  protected readonly pezzi = computed(() => this.contati().reduce((t, c) => t + c.contati, 0));
  protected readonly piu = computed(() => this.contati().reduce((t, c) => t + Math.max(0, this.differenza(c)), 0));
  protected readonly meno = computed(() => this.contati().reduce((t, c) => t + Math.max(0, -this.differenza(c)), 0));
  protected readonly daEliminare = computed(() => [...this.scelte().entries()].filter(([, s]) => s === 'elimina').map(([id]) => id));
  protected readonly statoMostrato = computed(() => (this.confermato() ? 'Confermato' : this.annullato() ? 'Annullato' : 'In corso'));

  constructor() {
    super();
    this.modifiche.imposta(false);
    void this.avvia();
  }

  protected toNum = toNumber;
  protected nsPagine(): number { return Math.max(1, Math.ceil(this.nsTotale() / 50)); }
  protected q2(v: number): string { return (Math.round(v * 100) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2 }); }
  /** giacenza nel gestionale: quella di oggi (in corso) o quella di prima della conferma */
  protected prima(c: Contato): number { return this.confermato() ? c.contati - c.diff : c.articolo.giacenza ?? 0; }
  protected differenza(c: Contato): number { return this.confermato() ? c.diff : c.contati - (c.articolo.giacenza ?? 0); }

  private async avvia(): Promise<void> {
    try {
      if (this.nuovo) { this.statoSalvato.set(null); this.modifiche.imposta(true); return; }
      const letto = await this.mov.leggi(this.id()!, this.sedeId);
      if (!letto || letto.mov.tipo !== 'riallineamento') { this.errore.set(`Inventario #${this.id()} non trovato`); return; }
      const m = letto.mov;
      this.versione = m.modificato_il;
      this.statoSalvato.set(m.stato);
      this.dataInv.set(m.data_movimento); this.annoInv.set(m.anno_acquisto);
      this.ambito.set(m.motivo === 'Solo una parte' ? 'parte' : 'tutto');
      this.note.set(m.causale ?? '');
      const mappa = new Map<string, Contato>(), scelte = new Map<string, Scelta>(), elim: { codice: string; descrizione: string }[] = [];
      letto.righe.forEach(r => {
        const a = r.articolo;
        if (!a) return;
        if (r.azione === 'elimina') { scelte.set(a.id, 'elimina'); elim.push({ codice: a.codice, descrizione: a.descrizione }); return; }
        const c = mappa.get(a.id) ?? { articolo: a, contati: 0, diff: 0, pos: ++this.pos };
        if (r.quantitaContata != null) c.contati += r.quantitaContata;
        c.diff += r.sped;
        mappa.set(a.id, c);
      });
      this.contati.set([...mappa.values()]);
      this.scelte.set(scelte);
      this.eliminati.set(elim);
      if (this.inCorso()) this.modifiche.imposta(true);   // il menu chiede prima di lasciare un inventario in corso
    } catch (e) {
      this.errore.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.caricamento.set(false);
    }
  }

  protected scegliAmbito(a: 'tutto' | 'parte'): void { if (this.inCorso() && !this.salvataggio()) this.ambito.set(a); }

  // ---------- Conteggio ----------
  private conta(a: ArticoloRiga, n: number, assoluto: boolean): void {
    this.contati.update(l => {
      const c = l.find(x => x.articolo.id === a.id);
      const nuovo: Contato = { articolo: c?.articolo ?? a, diff: c?.diff ?? 0, pos: ++this.pos, contati: Math.max(0, Math.round((assoluto ? n : (c?.contati ?? 0) + n) * 100) / 100) };
      return [...l.filter(x => x.articolo.id !== a.id), nuovo];
    });
    this.scelte.update(s => { const m = new Map(s); m.delete(a.id); return m; });
    this.ultimo.set(a.id);
  }
  protected passo(c: Contato, d: number): void { this.conta(c.articolo, d, false); }
  protected scrivi(c: Contato, e: Event): void { this.conta(c.articolo, leggiNumero(this.testo(e)), true); }
  protected togli(c: Contato): void { this.contati.update(l => l.filter(x => x !== c)); }

  protected cerca(e: Event): void {
    const t = this.testo(e).trim();
    this.attivo.set(0);
    clearTimeout(this.timer);
    if (t.length < 2) { this.trovati.set([]); return; }
    this.timer = setTimeout(() => void this.leggi(t), 200);
  }
  private async leggi(t: string): Promise<ArticoloRiga[]> {
    const l = (await this.supabase.rpc('cerca_articoli', { p_testo: t, p_sede: this.sedeId, p_fornitore: null, p_solo_fornitore: false, p_sede_altra: null, p_quanti: 30 })).map(articoloDaRicerca);
    this.trovati.set(l);
    return l;
  }
  protected async tasto(e: KeyboardEvent): Promise<void> {
    const campo = e.target as HTMLInputElement;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.attivo.set(Math.min(this.attivo() + 1, this.trovati().length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); this.attivo.set(Math.max(this.attivo() - 1, 0)); return; }
    if (e.key === 'Escape') { this.trovati.set([]); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(this.timer);
    const t = campo.value.trim();
    if (!t) return;
    const l = await this.leggi(t);
    const a = l[this.attivo()] ?? l[0];
    if (!a) { this.avvisi.mostra(`Nessun articolo con codice o barcode "${t}"`, true); return; }
    this.prendi(a);
    campo.value = '';
  }
  protected prendi(a: ArticoloRiga): void {
    if (!this.ambito()) { this.avvisi.mostra('Scegli prima cosa si conta: tutto il magazzino o solo una parte', true); return; }
    this.conta(a, Math.max(1, this.quanti() || 1), false);
    this.avvisi.mostra(`${a.codice}: ${this.q2(this.contati().find(c => c.articolo.id === a.id)?.contati ?? 0)} contati`);
    this.quanti.set(1);
    this.trovati.set([]);
  }

  // ---------- Non sparati (solo tutto il magazzino) ----------
  protected async caricaNonSparati(pagina = 0): Promise<void> {
    this.nsPagina.set(pagina);
    try {
      const r = await this.supabase.rpc('inventario_non_sparati', { p_sede: this.sedeId, p_contati: this.contati().map(c => c.articolo.id), p_da: pagina * 50, p_quanti: 50 });
      this.ns.set(r);
      this.nsTotale.set(r.length ? toNumber(r[0].totale) : 0);
    } catch (e) { this.avvisi.errore(e); }
  }
  protected apriTab(t: string): void { this.tab.set(t); if (t === 'nonsparati' && this.inCorso()) void this.caricaNonSparati(0); }
  protected scelta(id: string): Scelta { return this.scelte().get(id) ?? 'lascia'; }
  protected scegli(n: NonSparato, s: Scelta): void {
    if (s === 'modifica') { this.scelte.update(m => new Map(m).set(n.id, 'modifica')); return; }
    this.scelte.update(m => new Map(m).set(n.id, s));
  }
  protected modificaNs(n: NonSparato, e: Event): void {
    const a: ArticoloRiga = { id: n.id, codice: n.codice, descrizione: n.descrizione, barcode: n.barcode, fornitore_id: null, costo: toNumber(n.costo_netto), prezzo: 0, iva: 22,
      anno: null, unita: null, giacenza: toNumber(n.giacenza), giacenzaAltra: null, altroFornitore: false };
    this.conta(a, leggiNumero(this.testo(e)), true);
    this.avvisi.mostra(`${a.codice}: ${this.q2(leggiNumero(this.testo(e)))} contati (aggiunto tra i contati)`);
    void this.caricaNonSparati(this.nsPagina());
  }
  /** Lascia / Elimina tutti i non sparati (anche quelli delle altre pagine). */
  protected async tutti(s: 'lascia' | 'elimina'): Promise<void> {
    if (s === 'elimina' && !confirm('Mettere "Elimina" a TUTTI gli articoli non sparati? Alla conferma la loro giacenza va a zero e, se le altre sedi non ne hanno, vengono disattivati.')) return;
    const r = await this.supabase.rpc('inventario_non_sparati', { p_sede: this.sedeId, p_contati: this.contati().map(c => c.articolo.id), p_da: 0, p_quanti: 20000 });
    this.scelte.update(m => { const n = new Map(m); r.forEach(x => (s === 'lascia' ? n.delete(x.id) : n.set(x.id, 'elimina'))); return n; });
  }

  // ---------- Salvataggio e conferma ----------
  private datiMov(): MovimentoDaSalvare {
    return { tipo: 'riallineamento', stato: 'Provvisorio', sede_id: this.sedeId, data_movimento: this.oggi, anno_acquisto: this.annoOggi,
      motivo: this.ambito() === 'parte' ? 'Solo una parte' : 'Tutto il magazzino',
      causale: this.note().trim() || `Inventario ${this.ambito() === 'parte' ? 'di una parte' : 'di tutto il magazzino'} di ${this.nomeSede}`, spese: 0 };
  }
  private righeInCorso(): RigaDaSalvare[] {
    return this.contati().map(c => ({ articolo_id: c.articolo.id, quantita: 0, quantita_contata: c.contati, prezzo: c.articolo.costo || 0, etichette: 0 }))
      .concat(this.daEliminare().filter(id => !this.contati().some(c => c.articolo.id === id))
        .map(id => ({ articolo_id: id, quantita: 0, quantita_contata: 0, azione: 'elimina' as const, prezzo: 0, etichette: 0 })));
  }
  private controlla(): boolean {
    if (!this.ambito()) { this.avvisi.mostra('Scegli prima cosa si conta: tutto il magazzino o solo una parte', true); return false; }
    if (!this.contati().length && !this.daEliminare().length) { this.avvisi.mostra('Non hai ancora contato nessun articolo', true); return false; }
    return true;
  }
  /** In corso: si salvano i pezzi contati (la giacenza non cambia) e gli articoli da eliminare. */
  protected salvaInCorso(): void {
    if (!this.controlla()) return;
    void this.conSalvataggio(async () => {
      const id = await this.mov.salva(this.id(), this.datiMov(), this.righeInCorso(), this.versione);
      this.avvisi.mostra('Inventario salvato: puoi continuare a contare quando vuoi');
      this.dopoSalvataggio('/inventario', id, false, '/inventario');
    });
  }
  /** Conferma: prima si salvano i conteggi, poi il database calcola le differenze con la giacenza vera e conferma. */
  protected conferma(): void {
    if (!this.controlla()) return;
    const cambiano = this.contati().filter(c => this.differenza(c)).length;
    const elim = this.daEliminare().length;
    if (!confirm(`Confermare l'inventario di ${this.nomeSede}?\n\n• ${this.contati().length} articoli contati: la giacenza diventa quella contata, tutta sull'anno ${this.annoOggi} (${cambiano} cambiano)` +
      (this.ambito() === 'tutto' ? `\n• ${elim} non sparati eliminati (giacenza a zero e articolo disattivato); gli altri restano come sono` : '\n• gli articoli non sparati restano come sono') +
      '\n\nSe nel frattempo qualcuno ha venduto o scaricato, la giacenza diventa comunque quella contata.\nDopo la conferma la giacenza cambia davvero.')) return;
    void this.conSalvataggio(async () => {
      const id = await this.mov.salva(this.id(), this.datiMov(), this.righeInCorso(), this.versione);
      const r = await this.mov.confermaInventario(id);
      const tenuti = r.non_disattivati ?? [];
      this.avvisi.mostra(`Inventario confermato: ${r.contati} articoli contati, ${r.eliminati} eliminati${tenuti.length ? ` · non disattivati perché presenti in altre sedi: ${tenuti.join(', ')}` : ''}`, !!tenuti.length);
      this.dopoSalvataggio('/inventario', id, false, '/inventario');
    });
  }
  protected annullaInventario(): void {
    if (!confirm('Annullare questo inventario? I conteggi restano registrati ma la giacenza non cambia.')) return;
    void this.conSalvataggio(async () => {
      await this.mov.annulla(this.id()!);
      this.avvisi.mostra('Inventario annullato');
      this.dopoSalvataggio('/inventario', this.id()!, false, '/inventario');
    });
  }
  protected chiudi(): void { this.esciDaModifica(); void this.router.navigateByUrl('/inventario'); }

  protected stampa(): void {
    const lista = this.contati().slice().sort((a, b) => a.articolo.codice.localeCompare(b.articolo.codice));
    if (!lista.length) { this.avvisi.mostra('Non ci sono articoli contati da stampare'); return; }
    salvaPerStampa('stampa', {
      titolo: 'Inventario – differenze', sede: this.nomeSede,
      info: ([['Data', dataIt(this.dataInv())], ['Stato', this.statoMostrato()], ['Ambito', this.ambito() === 'parte' ? 'Solo una parte' : 'Tutto il magazzino']] as [string, string][])
        .concat(this.id() ? [['Numero', String(this.id())]] : []),
      destinatario: [],
      colonne: [{ k: 'cod', t: 'Codice', cod: true }, { k: 'descr', t: 'Descrizione' }, { k: 'prima', t: 'Gestionale', num: true }, { k: 'contati', t: 'Contati', num: true }, { k: 'diff', t: 'Differenza', num: true }],
      righe: lista.map(c => { const d = this.differenza(c); return { cod: c.articolo.codice, descr: c.articolo.descrizione, prima: this.q2(this.prima(c)), contati: this.q2(c.contati), diff: (d > 0 ? '+' : '') + this.q2(d) }; }),
      totali: [['Articoli contati', String(lista.length)], ['Pezzi contati', this.q2(this.pezzi())]],
      ritorno: this.router.url
    });
    void this.router.navigate(['/stampa']);
  }
}
