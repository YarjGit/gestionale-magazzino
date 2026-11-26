import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toNumber } from '../../core/models/database.types';
import { RegistroService } from '../../core/services/registro.service';
import { SedeService } from '../../core/services/sede.service';
import { ErroreDatabase, SupabaseService } from '../../core/services/supabase.service';
import { AvvisiService } from '../../shared/avvisi.service';
import { barcodeSvg, eanValido, tipoBarcode } from '../../shared/barcode';
import { numero } from '../../shared/formato';
import type { EtichetteDaStampare } from '../../shared/intestazioni';
import { aiDieciCentesimi, costoInLettere } from '../../shared/prezzi';
import { articoloDaRicerca } from '../../shared/righe-movimento';

type ArtEt = EtichetteDaStampare['righe'][number]['art'];
interface RigaEt { art: ArtEt; n: number; anno: number; scatola: boolean }
interface Misure { c: number; r: number; w: number; h: number; mt: number; ml: number; gx: number; gy: number }
type Formato = 'f4x12' | 'f4x14' | 'f4x10' | 'f3x8' | 'pers' | 'rotolo';
interface Copia { art: ArtEt; anno: number; perScatola: boolean; svg: SafeHtml }

const FORMATI: Record<Exclude<Formato, 'pers' | 'rotolo'>, Misure> = {
  // etichetta larga 4,1 cm, centrata nella sua colonna (passo 52,5 mm: 5,75 mm di margine, 11,5 mm tra le colonne)
  f4x12: { c: 4, r: 12, w: 41, h: 24.7, mt: 0.3, ml: 5.75, gx: 11.5, gy: 0 },
  f4x14: { c: 4, r: 14, w: 52.5, h: 21.2, mt: 0.1, ml: 0, gx: 0, gy: 0 },
  f4x10: { c: 4, r: 10, w: 52.5, h: 29.7, mt: 0, ml: 0, gx: 0, gy: 0 },
  f3x8: { c: 3, r: 8, w: 70, h: 37, mt: 0.5, ml: 0, gx: 0, gy: 0 }
};
const NOMI_FORMATI: [Formato, string][] = [
  ['f4x12', 'Foglio A4 adesivo – 4 × 12 (48 etichette 41 × 24,7 mm)'], ['f4x14', 'Foglio A4 adesivo – 4 × 14 (56 etichette 52,5 × 21,2 mm)'],
  ['f4x10', 'Foglio A4 adesivo – 4 × 10 (40 etichette 52,5 × 29,7 mm)'], ['f3x8', 'Foglio A4 adesivo – 3 × 8 (24 etichette 70 × 37 mm)'],
  ['pers', 'Foglio A4 – misure personalizzate'], ['rotolo', 'Rotolo per stampante etichette – 50 × 25 mm']
];
const CAMPI_MISURE: [keyof Misure, string, number][] = [['c', 'Colonne', 1], ['r', 'Righe', 1], ['w', 'Larghezza etichetta (mm)', 0.1], ['h', 'Altezza etichetta (mm)', 0.1],
  ['mt', 'Margine sopra (mm)', 0.1], ['ml', 'Margine sinistro (mm)', 0.1], ['gx', 'Spazio tra colonne (mm)', 0.1], ['gy', 'Spazio tra righe (mm)', 0.1]];
const leggiMemoria = <T,>(k: string): T | null => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') as T | null; } catch { return null; } };
const scriviMemoria = (k: string, v: unknown): void => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* senza memoria si usa il predefinito */ } };

/**
 * Stampa etichette (prototipo/etichette.html): fogli A4 4 × 12 (o altri formati, ricordati su questo PC), una per pezzo.
 * Ogni etichetta: codice, descrizione, anno di carico in due cifre, costo d'acquisto cifrato (M=1 A=2 G=3 I=4 S=5 T=6 E=7 R=8
 * P=9 D=0), prezzo ai 10 centesimi, barcode vero (EAN-13 se la cifra di controllo è giusta, altrimenti Code 128).
 * Arriva da una scheda (?da=sessione), dagli articoli (?cod=…) o vuota; si aggiunge anche con la pistola.
 * "🏷️ Doppia etichetta" (seconda etichetta col codice nel riquadro nero) solo per CAL SMM Roma (idea in prova).
 */
@Component({
  selector: 'app-etichette',
  imports: [RouterLink, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './etichette.html',
  styleUrl: './etichette.css'
})
export class Etichette implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  private readonly avvisi = inject(AvvisiService);
  private readonly registro = inject(RegistroService);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly sede = inject(SedeService);
  protected readonly numero = numero;
  protected readonly eanValido = eanValido;
  protected readonly tipoBarcode = tipoBarcode;
  protected readonly prezzoDieci = aiDieciCentesimi;
  protected readonly NOMI_FORMATI = NOMI_FORMATI;
  protected readonly CAMPI_MISURE = CAMPI_MISURE;
  protected readonly annoInCorso = new Date().getFullYear();

  protected readonly doppia = computed(() => this.sede.sede()?.nome === 'CAL SMM Roma');
  protected readonly righe = signal<RigaEt[]>([]);
  protected readonly titolo = signal('Etichette');
  protected readonly ritorno = signal<string>('/articoli');
  protected readonly salta = signal(0);
  protected readonly nascondiPrezzo = signal(false);
  protected readonly formato = signal<Formato>(leggiMemoria<Formato>('etichette.formato') ?? 'f4x12');
  protected readonly misurePers = signal<Misure>(leggiMemoria<Misure>('etichette.misure') ?? { ...FORMATI.f4x12 });
  protected readonly opz = signal({ codice: true, descr: true, numero: true, cifrato: true });
  protected readonly impostazioni = signal(false);
  protected readonly qta = signal(1);
  protected readonly trovati = signal<ArtEt[]>([]);
  protected readonly attivo = signal(0);
  protected readonly ultimo = signal<string | null>(null);
  protected readonly perStampa = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly totale = computed(() => this.righe().reduce((s, r) => s + r.n * (r.scatola && this.doppia() ? 2 : 1), 0));
  protected readonly misure = computed<Misure>(() => { const f = this.formato(); return f === 'pers' ? this.misurePers() : f === 'rotolo' ? FORMATI.f4x12 : FORMATI[f]; });
  protected readonly stileFoglio = computed(() => { const m = this.misure(); return `--c:${m.c};--r:${m.r};--w:${m.w};--h:${m.h};--mt:${m.mt};--ml:${m.ml};--gx:${m.gx};--gy:${m.gy}`; });
  /** una copia per etichetta; con la doppia etichetta, per ogni pezzo anche la seconda subito dopo */
  protected readonly copie = computed<Copia[]>(() => this.righe().flatMap(r => {
    const svg = this.sanitizer.bypassSecurityTrustHtml(barcodeSvg(r.art.barcode || r.art.codice));
    const una: Copia = { art: r.art, anno: r.anno, perScatola: false, svg };
    return Array.from({ length: r.n }, () => (r.scatola && this.doppia() ? [una, { ...una, perScatola: true }] : [una])).flat();
  }));
  protected readonly fogli = computed<(Copia | null)[][]>(() => {
    if (this.formato() === 'rotolo') return [];
    const m = this.misure(), per = m.c * m.r, copie = this.copie();
    const celle: (Copia | null)[] = [...Array<null>(copie.length ? Math.min(this.salta(), per - 1) : 0).fill(null), ...copie];
    const f: (Copia | null)[][] = [];
    for (let i = 0; i < celle.length; i += per) f.push(celle.slice(i, i + per));
    return f;
  });
  protected readonly perFoglio = computed(() => this.misure().c * this.misure().r);
  protected readonly infoPagine = computed(() => {
    if (this.formato() === 'rotolo') return this.copie().length ? `${this.copie().length} etichette sul rotolo` : '';
    const n = this.fogli().length, s = Math.min(this.salta(), this.perFoglio() - 1);
    return n ? `${n} fogl${n === 1 ? 'io' : 'i'} A4${s ? ` · ${s} posizioni saltate sul primo` : ''}` : '';
  });

  constructor() {
    document.body.classList.add('stampa-etichette');
    void this.avvia();
  }
  ngOnDestroy(): void { document.body.classList.remove('stampa-etichette'); }

  private async avvia(): Promise<void> {
    const q = this.route.snapshot.queryParamMap;
    if (q.get('da') === 'sessione') {
      try {
        const d = JSON.parse(sessionStorage.getItem('etichette') ?? 'null') as EtichetteDaStampare | null;
        if (d) { this.righe.set(d.righe.map(r => ({ ...r, scatola: false }))); this.titolo.set(d.titolo); this.ritorno.set(d.ritorno); }
      } catch { /* niente da stampare */ }
      return;
    }
    const codici = q.getAll('cod');
    if (codici.length === 1) this.ritorno.set(`/articoli/${encodeURIComponent(codici[0])}`);
    if (!codici.length) return;
    const { data, error } = await this.supabase.client.from('articoli').select('codice, descrizione, barcode, costo_netto, prezzo_vendita_ivato').in('codice', codici);
    if (error) { this.avvisi.errore(new ErroreDatabase(error)); return; }
    const art = (data ?? []) as { codice: string; descrizione: string; barcode: string | null; costo_netto: number | string; prezzo_vendita_ivato: number | string }[];
    this.righe.set(codici.map(c => art.find(a => a.codice === c)).filter((a): a is (typeof art)[number] => !!a)
      .map(a => ({ art: { codice: a.codice, descr: a.descrizione, barcode: a.barcode ?? '', costo: toNumber(a.costo_netto), prezzo: toNumber(a.prezzo_vendita_ivato) }, n: 1, anno: this.annoInCorso, scatola: false })));
  }

  protected testo(e: Event): string { return (e.target as HTMLInputElement).value; }
  protected spuntato(e: Event): boolean { return (e.target as HTMLInputElement).checked; }
  protected costoCifrato(v: number): string { return costoInLettere(v); }

  // ---------- Aggiunta (anche con la pistola: scrive il barcode e preme Invio) ----------
  protected cerca(e: Event): void {
    const t = this.testo(e).trim();
    this.attivo.set(0);
    clearTimeout(this.timer);
    if (t.length < 2) { this.trovati.set([]); return; }
    this.timer = setTimeout(() => void this.leggi(t), 200);
  }
  private async leggi(t: string): Promise<ArtEt[]> {
    const l = (await this.supabase.rpc('cerca_articoli', { p_testo: t, p_sede: this.sede.sedeId() ?? '', p_fornitore: null, p_solo_fornitore: false, p_sede_altra: null, p_quanti: 30 }))
      .map(articoloDaRicerca).map(a => ({ codice: a.codice, descr: a.descrizione, barcode: a.barcode ?? '', costo: a.costo, prezzo: a.prezzo }));
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
    if (!a) { this.avvisi.mostra(`Nessun articolo con codice o barcode "${t}"`); return; }
    this.aggiungi(a);
    campo.value = '';
  }
  /** Le etichette dello stesso articolo stanno vicine: la nuova riga va subito dopo quella che c'è già. */
  protected aggiungi(a: ArtEt): void {
    const n = Math.max(1, this.qta() || 1);
    this.righe.update(l => {
      const i = l.findIndex(r => r.art.codice === a.codice && r.anno === this.annoInCorso);
      if (i >= 0) return l.map((r, j) => (j === i ? { ...r, n: r.n + n } : r));
      const ultima = l.map(r => r.art.codice).lastIndexOf(a.codice);
      const c = [...l];
      c.splice(ultima < 0 ? c.length : ultima + 1, 0, { art: a, n, anno: this.annoInCorso, scatola: false });
      return c;
    });
    this.qta.set(1);
    this.trovati.set([]);
    this.ultimo.set(a.codice);
    this.avvisi.mostra(`${a.codice}: +${n} etichett${n === 1 ? 'a' : 'e'}`);
  }
  protected cambiaRiga(i: number, k: 'n' | 'anno' | 'scatola', e: Event): void {
    const el = e.target as HTMLInputElement;
    this.righe.update(l => l.map((r, j) => (j !== i ? r : k === 'scatola' ? { ...r, scatola: el.checked } : k === 'anno' ? { ...r, anno: Number(el.value) || this.annoInCorso } : { ...r, n: Math.max(0, Number(el.value) || 0) })));
  }
  protected togli(i: number): void { this.righe.update(l => l.filter((_, j) => j !== i)); }

  // ---------- Impostazioni (ricordate su questo PC) ----------
  protected cambiaFormato(f: string): void { this.formato.set(f as Formato); scriviMemoria('etichette.formato', f); }
  protected cambiaMisura(k: keyof Misure, e: Event): void {
    const v = parseFloat(this.testo(e));
    if (!(v >= 0)) return;
    this.misurePers.update(m => { const n = { ...m, [k]: k === 'c' || k === 'r' ? Math.max(1, Math.round(v)) : v }; scriviMemoria('etichette.misure', n); return n; });
  }
  protected cambiaOpz(k: 'codice' | 'descr' | 'numero' | 'cifrato', e: Event): void { const v = this.spuntato(e); this.opz.update(o => ({ ...o, [k]: v })); }
  protected nomeFormato(): string { return NOMI_FORMATI.find(f => f[0] === this.formato())?.[1] ?? ''; }

  /** Stampa: la finestra del browser con solo i fogli, alle misure vere (regole @media print in styles/app.css). */
  protected stampa(): void {
    if (!this.righe().some(r => r.n > 0)) { this.avvisi.mostra("Aggiungi almeno un'etichetta"); return; }
    void this.registro.registra('Stampa etichette', `${this.righe().reduce((s, r) => s + r.n, 0)} etichette di ${this.righe().filter(r => r.n > 0).length} articoli`);
    this.perStampa.set(true);
    setTimeout(() => { window.print(); this.perStampa.set(false); }, 50);
  }
  protected chiudi(): void { void this.router.navigateByUrl(this.ritorno()); }
  protected vuote(n: number): number[] { return Array.from({ length: Math.max(0, n) }, (_, i) => i); }
}
