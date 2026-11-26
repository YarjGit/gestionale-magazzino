import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, model, output, signal, viewChild } from '@angular/core';
import type { ArticoloTrovato, SedeId } from '../core/models/database.types';
import { toNumber } from '../core/models/database.types';
import { SedeService } from '../core/services/sede.service';
import { SupabaseService } from '../core/services/supabase.service';
import { AvvisiService } from './avvisi.service';
import { cent, leggiNumero, numero } from './formato';
import { costoInLettere } from './prezzi';

/** Articolo come lo usano le righe (dalla ricerca o da un movimento salvato). */
export interface ArticoloRiga {
  id: string;
  codice: string;
  descrizione: string;
  barcode: string | null;
  fornitore_id: string | null;
  costo: number;
  prezzo: number;
  /** percentuale IVA dell'articolo (22, 4, 0) */
  iva: number;
  anno: number | null;
  unita: string | null;
  /** null = giacenza non nota */
  giacenza: number | null;
  giacenzaAltra: number | null;
  altroFornitore: boolean;
}

export interface RigaMovimento {
  pos: number;
  articolo: ArticoloRiga | null;
  /** Ordinata (o quantità unica) */
  qta: number;
  /** Spedita / arrivata: quanto è uscito o entrato davvero */
  sped: number;
  prezzo: number;
  sconto: number;
  /** codice IVA della riga: '22', '04', '0', '--' (sede estera) */
  iva: string;
  etichette: number;
  etichetteMan: boolean;
  ordinata: number | null;
  ordineRigaId: number | null;
  /** pezzi aggiunti lo stesso anche se già in attesa (etichetta IN PIÙ) */
  oltreAttesa: boolean;
  /** ora in cui è stata aggiunta (vendite e-commerce) */
  ora: string;
  /** pezzi che questo movimento aveva già tolto dalla giacenza (si restituiscono nel controllo) */
  giaScaricati: number;
}

/** Configurazione delle righe (come avviaRighe del prototipo, js/righe-movimento.js). */
export interface ConfigRighe {
  etichettaPrezzo: string;
  /** prezzo unitario proposto: costo per gli acquisti, prezzo di vendita per le vendite */
  prezzoDi: (a: ArticoloRiga) => number;
  nelMovimento: string;
  /** prezzo già IVA inclusa (vendite) */
  ivaInclusa?: boolean;
  /** totale di riga senza IVA (carichi, come il prototipo) */
  senzaIva?: boolean;
  /** colonna Spedita (quanto è uscito davvero) */
  spedita?: boolean;
  /** con spedita: Ordinata vuota, si scrive solo Spedita (vendite) */
  soloSpedita?: boolean;
  senzaOrdinata?: boolean;
  /** Ordinata solo per le righe arrivate da un ordine (carichi, trasferimenti): le altre mostrano "—" */
  ordinataDaOrdine?: boolean;
  senzaSconto?: boolean;
  senzaAnno?: boolean;
  /** colonna Etichette (carichi): seguono la quantità finché non si cambiano a mano */
  etichette?: boolean;
  /** il costo è quello della scheda articolo, non si scrive */
  costoFisso?: boolean;
  /** ultima colonna = costo di un pezzo con IVA */
  perPezzo?: boolean;
  /** non si possono togliere più pezzi di quelli in giacenza */
  limiteGiacenza?: boolean;
  verboUscita?: string;
  /** ogni aggiunta è una riga a sé con l'ora (vendite e-commerce) */
  righeSeparate?: boolean;
  /** interruttore "anche articoli di altri fornitori" */
  conFornitore?: boolean;
  testoVuoto?: string;
}

export const ALIQUOTE_RIGA: [string, string, number][] = [['22', '22%', 22], ['04', '4% (ostie)', 4], ['0', '0% (libri)', 0], ['--', '0% (sede estera)', 0]];
export const percIvaRiga = (k: string): number => ALIQUOTE_RIGA.find(a => a[0] === k)?.[2] ?? 0;
export const ivaDiArticolo = (a: ArticoloRiga, estera: boolean): string => (estera ? '--' : a.iva === 4 ? '04' : a.iva === 0 ? '0' : '22');
export const articoloDaRicerca = (a: ArticoloTrovato): ArticoloRiga => ({
  id: a.id, codice: a.codice, descrizione: a.descrizione, barcode: a.barcode, fornitore_id: a.fornitore_id, costo: cent(toNumber(a.costo_netto)),
  prezzo: cent(toNumber(a.prezzo_vendita_ivato)), iva: toNumber(a.iva), anno: a.anno_listino, unita: a.unita_misura,
  giacenza: a.giacenza == null ? null : toNumber(a.giacenza), giacenzaAltra: a.giacenza_altra == null ? null : toNumber(a.giacenza_altra), altroFornitore: a.altro_fornitore
});

/** Totale della riga al centesimo: acquisti con l'IVA aggiunta, vendite già IVA inclusa; con Spedita conta quella. */
export function totaleRiga(r: RigaMovimento, cfg: ConfigRighe): number {
  const pezzi = cfg.spedita ? r.sped : r.qta;
  const iva = cfg.ivaInclusa || cfg.senzaIva ? 1 : 1 + percIvaRiga(r.iva) / 100;
  return cent(pezzi * r.prezzo * (1 - (r.sconto || 0) / 100) * iva);
}

const MIN_CARATTERI = 2;

/**
 * Righe articolo delle schede movimento: ＋ apre una riga in cui si scrive o si spara il codice (pistola = testo + Invio),
 * dopo ogni articolo si apre da sola una riga nuova; cestino, frecce, − / +, prezzo con ↻, IVA per riga, sconto, totale.
 * La ricerca la fa il database (cerca_articoli), mai su un catalogo in memoria. Le righe vuote si tolgono al salvataggio.
 */
@Component({
  selector: 'app-righe-movimento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './righe-movimento.html',
  styles: `
    .sugg-box { position: fixed; z-index: 60; background: #fff; border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 12px 30px rgba(20,30,50,.18); overflow: auto; }
    .sugg-box .sugg { display: flex; align-items: center; gap: 8px; padding: 7px 10px; cursor: pointer; font-size: .86rem; }
    .sugg-box .sugg.attivo, .sugg-box .sugg:hover { background: #eef5ff; }
    .sugg-box .sugg small { margin-left: auto; color: var(--muted); font-family: "JetBrains Mono", monospace; }
    .opzioni { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin: 0 0 8px; }
  `
})
export class RigheMovimentoComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly sede = inject(SedeService);
  private readonly avvisi = inject(AvvisiService);

  readonly config = input.required<ConfigRighe>();
  readonly righe = model.required<RigaMovimento[]>();
  readonly modifica = input(false);
  /** fornitore della scheda (gli altri articoli si segnano "di un altro fornitore") */
  readonly fornitore = input<string | null>(null);
  /** sede di cui mostrare anche la giacenza (es. il Magazzino Centrale a cui si ordina) */
  readonly sedeAltra = input<SedeId | null>(null);
  readonly siglaAltra = input('');
  readonly sedeEstera = input(false);
  /** anno da mostrare in "Anno giac." al posto di quello dell'articolo (es. anno del carico) */
  readonly annoGiac = input<number | null>(null);
  readonly scontoNuovo = input(0);
  /** false blocca le aggiunte (es. manca il fornitore): la pagina lo spiega con motivoBlocco */
  readonly puoAggiungere = input(true);
  readonly motivoBlocco = input('');
  /** testo accanto all'articolo (es. "già in attesa: 5") */
  readonly notaArticolo = input<(a: ArticoloRiga) => string>(() => '');
  /** true = l'articolo non entra subito: la pagina chiede e, se serve, chiama aggiungiLoStesso */
  readonly fermaArticolo = input<((a: ArticoloRiga, n: number) => boolean) | null>(null);
  readonly cambiate = output<void>();

  protected readonly ALIQUOTE = ALIQUOTE_RIGA;
  protected readonly numero = numero;
  protected readonly costoInLettere = costoInLettere;
  protected readonly tuttiFornitori = signal(false);
  protected readonly nuoviInAlto = signal(true);
  protected readonly ordinaCodice = signal(false);
  protected readonly ultima = signal<number | null>(null);

  // ricerca nella riga vuota
  protected readonly rigaCerca = signal<number | null>(null);
  protected readonly trovati = signal<ArticoloRiga[]>([]);
  protected readonly attivo = signal(0);
  protected readonly testoCerca = signal('');
  protected readonly messaggio = signal('');
  protected readonly posBox = signal<{ left: number; top: number | null; bottom: number | null; width: number; max: number } | null>(null);
  private sceltoBarcode = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private richiesta = 0;
  private readonly corpo = viewChild<ElementRef<HTMLElement>>('corpo');

  protected readonly inOrdine = computed(() => {
    const l = this.righe().slice();
    if (this.ordinaCodice()) return l.sort((a, b) => (a.articolo?.codice ?? '').localeCompare(b.articolo?.codice ?? ''));
    return l.sort((a, b) => (this.nuoviInAlto() ? b.pos - a.pos : a.pos - b.pos));
  });
  protected readonly colonne = computed(() => {
    const c = this.config();
    return 9 + (c.spedita ? 1 : 0) - (c.senzaAnno ? 1 : 0) - (c.senzaOrdinata ? 1 : 0) - (c.senzaSconto ? 1 : 0) + (c.etichette ? 1 : 0);
  });
  readonly totale = computed(() => cent(this.righe().reduce((s, r) => s + (r.articolo ? totaleRiga(r, this.config()) : 0), 0)));
  readonly pezzi = computed(() => this.righe().reduce((s, r) => s + (r.articolo ? (this.config().spedita ? r.sped : r.qta) : 0), 0));
  protected readonly totOrdinata = computed(() => this.righe().reduce((s, r) => s + (r.articolo ? r.qta : 0), 0));
  protected readonly totEtichette = computed(() => this.righe().reduce((s, r) => s + (r.articolo ? r.etichette : 0), 0));

  // ---------- Regole ----------
  private pezziDi(r: RigaMovimento): number { return this.config().spedita ? r.sped : r.qta; }
  private disponibili(a: ArticoloRiga): number {
    return (a.giacenza ?? 0) + this.righe().filter(r => r.articolo?.id === a.id).reduce((s, r) => s + r.giaScaricati, 0);
  }
  private altriPezzi(a: ArticoloRiga, esclusa: RigaMovimento | null): number {
    return this.righe().reduce((s, x) => s + (x !== esclusa && x.articolo?.id === a.id ? this.pezziDi(x) : 0), 0);
  }
  private testoOltre(a: ArticoloRiga, pezzi: number): string {
    const d = this.disponibili(a);
    return `${a.codice}: non si possono ${this.config().verboUscita ?? 'vendere'} ${pezzi === 1 ? '1 pezzo' : `${pezzi} pezzi`}, in giacenza ${d <= 0 ? "non ce n'è nessuno" : d === 1 ? "ce n'è solo 1" : `ce ne sono solo ${d}`}`;
  }
  /** true (con avviso rosso) se i pezzi superano la giacenza; senza giacenza nota non blocca (il database ricontrolla) */
  private oltreGiacenza(a: ArticoloRiga | null, pezzi: number): boolean {
    if (!a || !this.config().limiteGiacenza || a.giacenza == null || pezzi <= this.disponibili(a)) return false;
    this.avvisi.mostra(this.testoOltre(a, pezzi), true);
    return true;
  }
  /** primo articolo oltre la giacenza (controllo al salvataggio), oppure '' */
  oltreGiacenzaTesto(): string {
    if (!this.config().limiteGiacenza) return '';
    const r = this.righe().find(x => x.articolo && x.articolo.giacenza != null && this.altriPezzi(x.articolo, null) > this.disponibili(x.articolo));
    return r?.articolo ? this.testoOltre(r.articolo, this.altriPezzi(r.articolo, null)) : '';
  }

  private nuovaPos(): number { return this.righe().reduce((m, x) => Math.max(m, x.pos), 0) + 1; }
  private ricalcola(r: RigaMovimento): RigaMovimento {
    if (this.config().etichette && !r.etichetteMan) r.etichette = this.pezziDi(r);
    return r;
  }
  private aggiornaRiga(pos: number, f: (r: RigaMovimento) => void): void {
    this.righe.update(l => l.map(r => { if (r.pos !== pos) return r; const c = { ...r }; f(c); return this.ricalcola(c); }));
    this.cambiate.emit();
  }
  protected totRiga(r: RigaMovimento): number { return totaleRiga(r, this.config()); }
  protected costoPezzo(r: RigaMovimento): number { return cent(r.prezzo * (1 + percIvaRiga(r.iva) / 100)); }
  protected nomeIva(k: string): string { return ALIQUOTE_RIGA.find(a => a[0] === k)?.[1] ?? k; }
  protected pezziIt(q: number | null): string { return q == null ? '?' : q.toLocaleString('it-IT', { maximumFractionDigits: 2 }); }
  protected sigla(): string { const n = this.sede.sede()?.nome ?? ''; return n.replace(/^CAL /, '').split(' ').map(p => p[0]).join('').toUpperCase(); }
  protected ora(r: RigaMovimento): string { return new Date(r.ora).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); }
  protected classeArrivo(r: RigaMovimento): string {
    return r.ordinata == null ? '' : r.sped === r.ordinata ? 'completo' : r.sped < r.ordinata ? 'parziale' : 'troppo';
  }

  /** Riga nuova per un articolo (stessa struttura ovunque). */
  private rigaPer(a: ArticoloRiga | null, n: number, forza = false): RigaMovimento {
    return this.ricalcola({
      pos: this.nuovaPos(), articolo: a, qta: n, sped: n, prezzo: a ? cent(this.config().prezzoDi(a)) : 0, sconto: this.scontoNuovo(),
      iva: a ? ivaDiArticolo(a, this.sedeEstera()) : '22', etichette: n, etichetteMan: false, ordinata: null, ordineRigaId: null,
      oltreAttesa: forza, ora: new Date().toISOString(), giaScaricati: 0
    });
  }

  /** Mette l'articolo nel movimento: se c'è già (e le righe non sono separate) aumenta la quantità della sua riga. */
  aggiungi(a: ArticoloRiga, n = 1, forza = false): boolean {
    const esistente = this.config().righeSeparate ? null : this.righe().find(x => x.articolo?.id === a.id) ?? null;
    if (!esistente && !forza && this.fermaArticolo()?.(a, n)) return false;
    if (this.oltreGiacenza(a, this.altriPezzi(a, null) + n)) return false;
    if (esistente) {
      this.aggiornaRiga(esistente.pos, r => { r.qta += n; if (this.config().spedita) r.sped += n; });
      this.ultima.set(esistente.pos);
    } else {
      const r = this.rigaPer(a, n, forza);
      this.righe.update(l => [...l, r]);
      this.ultima.set(r.pos);
      this.cambiate.emit();
    }
    const nota = this.notaArticolo()(a);
    const tot = this.righe().filter(x => x.articolo?.id === a.id).reduce((s, x) => s + this.pezziDi(x), 0);
    this.avvisi.mostra(`${a.codice}: ${tot} ${this.config().nelMovimento}` + (a.altroFornitore ? ' · attenzione: non risulta di questo fornitore' : '') + (nota ? ' · ' + nota : ''));
    return true;
  }

  /** Dopo la conferma della pagina (es. "Ne servono di più"): aggiunge lo stesso, con l'etichetta IN PIÙ. */
  aggiungiLoStesso(a: ArticoloRiga, n: number): void {
    const vuota = this.righe().find(r => !r.articolo);
    if (vuota) this.righe.update(l => l.filter(r => r !== vuota));
    this.aggiungi(a, n, true);
  }

  /** Righe già pronte (movimento salvato, ordine da caricare…). */
  carica(righe: RigaMovimento[]): void { this.righe.set(righe.map(r => this.ricalcola({ ...r }))); this.cambiate.emit(); }

  /** Tasto ＋: riga vuota in cui si scrive o si spara il codice. */
  nuovaRiga(): void {
    if (!this.puoAggiungere()) { this.avvisi.mostra(this.motivoBlocco() || 'Non si possono aggiungere articoli adesso', true); return; }
    if (this.righe().some(r => !r.articolo)) { this.focusRigaVuota(); return; }
    const r = this.rigaPer(null, 1);
    this.righe.update(l => [...l, r]);
    this.ultima.set(r.pos);
    this.focusRigaVuota();
  }
  private focusRigaVuota(): void {
    setTimeout(() => this.corpo()?.nativeElement.querySelector<HTMLInputElement>('input[data-cerca]')?.focus());
  }

  /** Le righe vuote (es. quella aperta da sola dopo la pistola) si tolgono senza chiedere. */
  togliVuote(): void { this.righe.update(l => l.filter(r => r.articolo)); }

  // ---------- Ricerca ----------
  private async cerca(testo: string): Promise<ArticoloRiga[]> {
    const t = testo.trim();
    if (t.length < MIN_CARATTERI) return [];
    const forn = this.fornitore();
    const r = await this.supabase.rpc('cerca_articoli', { p_testo: t, p_sede: this.sede.sedeId() ?? '', p_fornitore: forn,
      p_solo_fornitore: !!this.config().conFornitore && !!forn && !this.tuttiFornitori(), p_sede_altra: this.sedeAltra(), p_quanti: 50 });
    return r.map(articoloDaRicerca);
  }

  protected scrivi(pos: number, e: Event): void {
    const campo = e.target as HTMLInputElement;
    const t = campo.value;
    this.testoCerca.set(t);
    this.rigaCerca.set(pos);
    this.attivo.set(0);
    this.sceltoBarcode = false;
    this.posiziona(campo);
    clearTimeout(this.timer);
    if (t.trim().length < MIN_CARATTERI) { this.trovati.set([]); this.messaggio.set(t.trim() ? `Scrivi almeno ${MIN_CARATTERI} caratteri` : ''); return; }
    this.messaggio.set('Cerco…');
    this.timer = setTimeout(() => void this.aggiornaTrovati(t), 200);
  }

  private async aggiornaTrovati(t: string): Promise<ArticoloRiga[]> {
    const mia = ++this.richiesta;
    try {
      const l = await this.cerca(t);
      if (mia === this.richiesta) { this.trovati.set(l); this.messaggio.set(l.length ? '' : this.nessuno()); }
      return l;
    } catch (e) {
      if (mia === this.richiesta) this.messaggio.set(e instanceof Error ? e.message : String(e));
      return [];
    }
  }
  private nessuno(): string {
    return this.config().conFornitore && this.fornitore() && !this.tuttiFornitori()
      ? 'Nessun articolo di questo fornitore: attiva "anche di altri fornitori" se è di un altro' : 'Nessun articolo trovato';
  }

  /** La lista si apre "sopra" la pagina (position: fixed), sotto il campo o verso l'alto se sotto non c'è spazio. */
  private posiziona(campo: HTMLElement): void {
    const r = campo.getBoundingClientRect();
    const sotto = innerHeight - r.bottom - 12, sopra = r.top - 12;
    const suVersoAlto = sotto < 220 && sopra > sotto;
    const width = Math.max(r.width, 460);
    this.posBox.set({ left: Math.max(8, Math.min(r.left, innerWidth - width - 8)), width, max: Math.max(160, Math.min(320, suVersoAlto ? sopra : sotto)),
      top: suVersoAlto ? null : r.bottom + 4, bottom: suVersoAlto ? innerHeight - r.top + 4 : null });
  }

  protected async tasto(pos: number, e: KeyboardEvent): Promise<void> {
    const l = this.trovati();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.attivo.set(Math.max(0, Math.min(this.attivo() + (e.key === 'ArrowDown' ? 1 : -1), l.length - 1)));
      return;
    }
    if (e.key === 'Escape') { this.rigaCerca.set(null); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const letto = (e.target as HTMLInputElement).value.trim();
    if (!letto) return;
    // pistola: il testo arriva tutto insieme con Invio, prima che la ricerca sia finita → si cerca subito quel testo
    clearTimeout(this.timer);
    const lista = this.testoCerca() === letto && l.length && !this.messaggio() ? l : await this.aggiornaTrovati(letto);
    const stesso = lista.filter(a => a.barcode === letto);
    if (stesso.length > 1 && !this.sceltoBarcode) {
      this.sceltoBarcode = true;
      this.trovati.set(lista);
      this.avvisi.mostra(`Il barcode ${letto} è su ${stesso.length} articoli (${stesso.map(a => a.codice).join(', ')}): scegli quello giusto con le frecce e premi Invio`, true);
      return;
    }
    const scelto = lista[this.attivo()] ?? null;
    if (!scelto) { this.avvisi.mostra(this.messaggio() || `Nessun articolo con codice o barcode "${letto}"`); return; }
    this.completa(pos, scelto, true);
  }

  protected scegli(pos: number, a: ArticoloRiga): void { this.completa(pos, a, true); }

  /** La riga vuota diventa la riga dell'articolo (o, se l'articolo c'è già, la quantità va sulla sua riga). */
  private completa(pos: number, a: ArticoloRiga, apriNuova: boolean): void {
    const vuota = this.righe().find(r => r.pos === pos);
    if (!vuota) return;
    this.rigaCerca.set(null);
    this.trovati.set([]);
    if (!this.config().righeSeparate && this.righe().some(x => x.articolo?.id === a.id)) {
      this.righe.update(l => l.filter(r => r !== vuota));
      this.aggiungi(a, vuota.qta);
    } else {
      if (this.oltreGiacenza(a, this.altriPezzi(a, vuota) + this.pezziDi(vuota))) return;
      if (this.fermaArticolo()?.(a, vuota.qta)) return;
      this.aggiornaRiga(pos, r => { r.articolo = a; r.prezzo = cent(this.config().prezzoDi(a)); r.iva = ivaDiArticolo(a, this.sedeEstera()); });
      this.ultima.set(pos);
      if (a.altroFornitore) this.avvisi.mostra(`${a.codice}: attenzione, non risulta di questo fornitore`);
    }
    // subito una riga nuova, così la pistola continua senza cliccare ＋
    if (apriNuova) this.nuovaRiga();
  }

  protected chiudiLista(): void { setTimeout(() => this.rigaCerca.set(null), 180); }

  // ---------- Modifiche alle righe ----------
  protected togli(pos: number): void { this.righe.update(l => l.filter(r => r.pos !== pos)); this.cambiate.emit(); }
  protected sposta(r: RigaMovimento, d: number): void {
    const l = this.inOrdine(), v = l[l.indexOf(r) + d];
    if (!v) return;
    this.righe.update(x => x.map(y => (y === r ? { ...y, pos: v.pos } : y === v ? { ...y, pos: r.pos } : y)));
    this.ultima.set(v.pos);
  }
  protected passo(r: RigaMovimento, campo: 'qta' | 'sped', d: number): void {
    if (d > 0 && this.oltreGiacenza(r.articolo, this.altriPezzi(r.articolo!, r) + this.pezziDi(r) + 1)) return;
    const solo = !!this.config().soloSpedita;
    this.aggiornaRiga(r.pos, x => {
      if (campo === 'sped') { x.sped = Math.max(solo ? 1 : 0, x.sped + d); if (solo) x.qta = x.sped; }
      else { const segue = x.sped === x.qta; x.qta = Math.max(1, x.qta + d); if (segue) x.sped = x.qta; }
    });
  }
  protected cambia(r: RigaMovimento, campo: 'qta' | 'sped' | 'prezzo' | 'sconto' | 'iva' | 'etichette', e: Event): void {
    const el = e.target as HTMLInputElement;
    const v = el.value;
    if ((campo === 'qta' || campo === 'sped') && r.articolo) {
      const n = Math.max(0, leggiNumero(v));
      if (this.oltreGiacenza(r.articolo, this.altriPezzi(r.articolo, r) + n)) { el.value = String(campo === 'qta' ? r.qta : r.sped); return; }
    }
    const solo = !!this.config().soloSpedita;
    this.aggiornaRiga(r.pos, x => {
      if (campo === 'prezzo') x.prezzo = cent(leggiNumero(v));
      else if (campo === 'sconto') x.sconto = Math.min(100, Math.max(0, leggiNumero(v)));
      else if (campo === 'iva') x.iva = v;
      else if (campo === 'etichette') { x.etichette = Math.max(0, Math.round(leggiNumero(v))); x.etichetteMan = true; }
      else if (campo === 'sped') { x.sped = Math.max(solo ? 1 : 0, leggiNumero(v)); if (solo) x.qta = x.sped; }
      else { const prima = x.qta; x.qta = Math.max(1, leggiNumero(v) || 1); if (x.sped === prima) x.sped = x.qta; }
    });
  }
  protected riprezzo(r: RigaMovimento): void { if (r.articolo) { const p = cent(this.config().prezzoDi(r.articolo)); this.aggiornaRiga(r.pos, x => (x.prezzo = p)); } }
  protected cambiaArticolo(r: RigaMovimento): void {
    this.righe.update(l => l.map(x => (x.pos === r.pos ? { ...x, articolo: null } : x)));
    this.focusRigaVuota();
  }
  /** Stesso sconto su tutte le righe (es. sconto del cliente). */
  scontoATutte(p: number): void { this.righe.update(l => l.map(r => ({ ...r, sconto: p }))); this.cambiate.emit(); }
  protected spuntato(e: Event): boolean { return (e.target as HTMLInputElement).checked; }
  protected testo(e: Event): string { return (e.target as HTMLInputElement).value; }
}
