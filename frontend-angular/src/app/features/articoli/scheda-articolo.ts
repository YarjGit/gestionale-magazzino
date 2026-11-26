import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Articolo, LottoArticolo, MaterialeArticolo, MovimentoArticolo, PrevistoSede, RegistroAttivita } from '../../core/models/database.types';
import { toNumber } from '../../core/models/database.types';
import { ModificheService } from '../../core/services/modifiche.service';
import { SedeService } from '../../core/services/sede.service';
import { AvvisiService } from '../../shared/avvisi.service';
import { barcodeSvg } from '../../shared/barcode';
import { CercaFornitore } from '../../shared/cerca-fornitore';
import { cent, dataIt, euro, leggiNumero, numero } from '../../shared/formato';
import { Paginatore } from '../../shared/paginatore';
import { percorsoMovimento } from '../../shared/percorsi-movimenti';
import { aiDieciCentesimi, ALIQUOTE_ARTICOLO, arrotondamentoDieci, arrotondamentoEuro, calcola, percIva } from '../../shared/prezzi';
import { FornitoriSedeService, type FornitoreBreve } from '../fornitori/fornitori-sede.service';
import { SchedaArticoloService, type ArticoloScheda } from './scheda-articolo.service';

type Tab = 'dettagli' | 'materiali' | 'giacenza' | 'altre' | 'movimenti' | 'storico';

/** Valori della scheda mentre si guarda o si modifica (i prezzi si ricalcolano, il database li ricontrolla al salvataggio). */
interface Modulo {
  codice: string;
  descrizione: string;
  barcode: string;
  attivo: boolean;
  provenienza: string;
  unita: string;
  iva: string;
  scorta: number;
  annoListino: string;
  scaffale: string;
  annotazioni: string;
  fornitore: string | null;
  fornitoreDedotto: boolean;
  costoLordo: number;
  sconto: number;
  ricarico: number;
  arrotondamento: number;
  confezione: number;
  imballaggio: number;
  accessorie: number;
  materiali: MaterialeArticolo[];
}

const UNITA = ['Numero', 'Metri', 'Litri', 'Chili', 'Paia', 'Conf.', 'Dozz.'];
const PROVENIENZE = ['Magazzino Centrale', 'Fornitori', 'Laboratorio'];
const VUOTO: Modulo = {
  codice: '', descrizione: '', barcode: '', attivo: true, provenienza: 'Fornitori', unita: 'Numero', iva: '22', scorta: 0,
  annoListino: String(new Date().getFullYear()), scaffale: '', annotazioni: '', fornitore: null, fornitoreDedotto: false,
  costoLordo: 0, sconto: 0, ricarico: 100, arrotondamento: 0, confezione: 0, imballaggio: 0, accessorie: 0, materiali: []
};

/**
 * Scheda articolo (prototipo/articolo.html): Dettagli con il calcolo del prezzo, Materiali, Giacenza per anno di acquisto,
 * Giacenza altre sedi, Movimenti, Storico. Si apre in sola lettura; /articoli/nuovo apre un articolo nuovo già in modifica.
 * Prezzo: (costo netto + spese) × (1 + ricarico) = prezzo senza IVA; + IVA; + arrotondamento = prezzo in etichetta (ai 10 centesimi).
 */
@Component({
  selector: 'app-scheda-articolo',
  imports: [CercaFornitore, Paginatore, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scheda-articolo.html',
  styleUrl: './scheda-articolo.css'
})
export class SchedaArticolo implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dati = inject(SchedaArticoloService);
  private readonly fornitoriSede = inject(FornitoriSedeService);
  private readonly avvisi = inject(AvvisiService);
  private readonly modifiche = inject(ModificheService);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly sede = inject(SedeService);

  protected readonly UNITA = UNITA;
  protected readonly PROVENIENZE = PROVENIENZE;
  protected readonly ALIQUOTE = ALIQUOTE_ARTICOLO;
  protected readonly numero = numero;
  protected readonly euro = euro;
  protected readonly dataIt = dataIt;
  protected readonly toNumber = toNumber;
  protected readonly annoCorrente = new Date().getFullYear();

  private readonly codiceRotta = this.route.snapshot.paramMap.get('codice') ?? '';
  protected readonly nuovo = this.route.snapshot.routeConfig?.path === 'articoli/nuovo';

  protected readonly articolo = signal<ArticoloScheda | null>(null);
  protected readonly modulo = signal<Modulo>({ ...VUOTO, materiali: [] });
  private prima: Modulo | null = null;
  protected readonly inModifica = signal(this.nuovo);
  protected readonly salvataggio = signal(false);
  protected readonly caricamento = signal(!this.nuovo);
  protected readonly errore = signal<string | null>(null);
  protected readonly tab = signal<Tab>('dettagli');
  protected readonly fornitori = signal<FornitoreBreve[]>([]);

  protected readonly lotti = signal<LottoArticolo[] | null>(null);
  protected readonly previsto = signal<PrevistoSede[] | null>(null);
  protected readonly movimenti = signal<MovimentoArticolo[] | null>(null);
  protected readonly movPagina = signal(0);
  protected readonly movPerPagina = signal(50);
  protected readonly movTotale = signal(0);
  protected readonly storico = signal<RegistroAttivita[] | null>(null);
  protected readonly erroreGiacenza = signal<string | null>(null);

  protected readonly calcolo = computed(() => {
    const m = this.modulo();
    return calcola({ costoLordo: m.costoLordo, sconto: m.sconto, ricarico: m.ricarico, iva: percIva(m.iva), confezione: m.confezione,
      imballaggio: m.imballaggio, accessorie: m.accessorie, arrotondamento: m.arrotondamento });
  });
  protected readonly percIvaScelta = computed(() => percIva(this.modulo().iva));
  protected readonly barcode = computed<SafeHtml>(() => {
    const b = this.modulo().barcode.trim();
    // SVG creato da noi (solo numeri e lettere fisse): sicuro da inserire
    return this.sanitizer.bypassSecurityTrustHtml(b ? barcodeSvg(b, 38) : '');
  });
  protected readonly magazzinoCentrale = computed(() => this.sede.sedeId() === 'magazzino-centrale');
  protected readonly totaleMateriali = computed(() => cent(this.modulo().materiali.reduce((t, m) => t + (Number(m.costo) || 0), 0)));
  protected readonly giacenzaSede = computed(() => toNumber(this.previsto()?.find(p => p.sede_id === this.sede.sedeId())?.giacenza));
  protected readonly previstoSede = computed(() => this.previsto()?.find(p => p.sede_id === this.sede.sedeId()) ?? null);
  protected readonly altreSedi = computed(() => (this.previsto() ?? []).filter(p => p.sede_id !== this.sede.sedeId()));
  protected readonly conAltreUscite = computed(() => (this.lotti() ?? []).some(l => toNumber(l.altre_uscite) !== 0));
  protected readonly totaleLotti = computed(() => {
    const l = this.lotti() ?? [];
    const s = (k: keyof LottoArticolo): number => l.reduce((t, x) => t + toNumber(x[k]), 0);
    return { iniziale: s('iniziale'), caricata: s('caricata'), venduta: s('venduta'), altre: s('altre_uscite'), finale: s('finale') };
  });

  constructor() {
    void this.avvia();
  }

  ngOnDestroy(): void {
    this.modifiche.imposta(false);
  }

  private async avvia(): Promise<void> {
    const sede = this.sede.sedeId() ?? '';
    try {
      if (this.nuovo) {
        this.fornitori.set(await this.fornitoriSede.elenco(sede));
        this.modifiche.imposta(true);
        return;
      }
      const a = await this.dati.leggi(this.codiceRotta);
      if (!a) { this.errore.set(`L'articolo ${this.codiceRotta} non esiste`); return; }
      this.articolo.set(a);
      this.modulo.set(this.daArticolo(a));
      this.fornitori.set(await this.fornitoriSede.elenco(sede, [a.fornitore_id, a.fornitore2_id]));
      void this.caricaGiacenze(a.id);
    } catch (e) {
      this.errore.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.caricamento.set(false);
    }
  }

  /** Valori della scheda dall'articolo del database; l'arrotondamento è quello che porta al prezzo in etichetta salvato. */
  private daArticolo(a: ArticoloScheda): Modulo {
    const perc = a.aliquote_iva ? toNumber(a.aliquote_iva.aliquota) : percIva(a.aliquota_iva);
    const codiceIva = ALIQUOTE_ARTICOLO.find(x => x.perc === perc)?.codice ?? '22';
    const m: Modulo = {
      codice: a.codice, descrizione: a.descrizione, barcode: a.barcode ?? '', attivo: a.attivo !== false,
      provenienza: a.provenienza ?? (a.fornitore_id ? 'Fornitori' : 'Magazzino Centrale'), unita: a.unita_misura ?? 'Numero', iva: codiceIva,
      scorta: a.scorta_minima ?? 0, annoListino: a.anno_listino ? String(a.anno_listino) : '', scaffale: a.scaffale ?? '',
      annotazioni: a.annotazioni ?? '', fornitore: a.fornitore_id, fornitoreDedotto: !!a.fornitore_dedotto,
      costoLordo: cent(toNumber(a.costo_lordo) || toNumber(a.costo_netto)), sconto: toNumber(a.sconto),
      ricarico: a.ricarico == null ? 100 : toNumber(a.ricarico), arrotondamento: 0,
      confezione: toNumber(a.spese_confezione), imballaggio: toNumber(a.spese_imballaggio), accessorie: toNumber(a.spese_accessorie),
      materiali: Array.isArray(a.materiali) ? a.materiali.map(x => ({ ...x })) : []
    };
    const c = calcola({ ...m, iva: perc });
    m.arrotondamento = cent(toNumber(a.prezzo_vendita_ivato) - c.conIva);
    return m;
  }

  private async caricaGiacenze(id: string): Promise<void> {
    const sede = this.sede.sedeId() ?? '';
    this.erroreGiacenza.set(null);
    try {
      const [lotti, previsto] = await Promise.all([this.dati.lotti(id, sede), this.dati.previsto(id)]);
      this.lotti.set(lotti);
      this.previsto.set(previsto);
      await this.caricaMovimenti();
    } catch (e) {
      this.erroreGiacenza.set(e instanceof Error ? e.message : String(e));
    }
  }

  protected async caricaMovimenti(): Promise<void> {
    const a = this.articolo();
    if (!a) return;
    try {
      const righe = await this.dati.movimenti(a.id, this.sede.sedeId() ?? '', this.movPagina() * this.movPerPagina(), this.movPerPagina());
      this.movimenti.set(righe);
      this.movTotale.set(righe.length ? toNumber(righe[0].totale) : 0);
    } catch (e) {
      this.erroreGiacenza.set(e instanceof Error ? e.message : String(e));
    }
  }

  protected apriTab(t: Tab): void {
    this.tab.set(t);
    const a = this.articolo();
    if (t === 'storico' && a && this.storico() === null) {
      this.dati.storico(a.codice).then(s => this.storico.set(s), (e: unknown) => { this.storico.set([]); this.avvisi.errore(e); });
    }
  }

  protected cambiaPaginaMov(p: number): void { this.movPagina.set(p); void this.caricaMovimenti(); }
  protected cambiaPerPaginaMov(n: number): void { this.movPerPagina.set(n); this.movPagina.set(0); void this.caricaMovimenti(); }

  // ---------- Campi ----------
  protected testo(e: Event): string { return (e.target as HTMLInputElement).value; }
  protected spuntato(e: Event): boolean { return (e.target as HTMLInputElement).checked; }
  protected imposta<K extends keyof Modulo>(k: K, v: Modulo[K]): void { this.modulo.update(m => ({ ...m, [k]: v })); }

  protected scegliFornitore(id: string | null): void {
    this.modulo.update(m => ({ ...m, fornitore: id, fornitoreDedotto: id === m.fornitore ? m.fornitoreDedotto : false }));
  }

  /** Percentuali (sconto, ricarico) come numero semplice: 10, 12,5. */
  protected percento(v: number): string { return (Number(v) || 0).toLocaleString('it-IT', { maximumFractionDigits: 2 }); }

  /**
   * Costo, sconto o ricarico cambiati: il ricarico resta quello (di solito 100) e il prezzo si ricalcola ai 10 centesimi.
   * Il ricarico cambia solo se lo si scrive a mano (deciso con l'utente).
   */
  protected cambiaPrezzo(k: 'costoLordo' | 'sconto' | 'ricarico', e: Event): void {
    const el = e.target as HTMLInputElement;
    let v = k === 'costoLordo' ? cent(leggiNumero(el.value)) : cent(Number(el.value.replace('%', '').replace(',', '.').trim()) || 0);
    if (k === 'sconto') v = Math.min(100, Math.max(0, v));
    if (k === 'costoLordo') v = Math.max(0, v);
    this.modulo.update(m => ({ ...m, [k]: v }));
    this.arrotondaDieci();
    el.value = k === 'costoLordo' ? numero(v) : this.percento(v);
  }

  protected cambiaIva(codice: string): void {
    this.imposta('iva', codice);
    this.arrotondaDieci();
  }

  private arrotondaDieci(): void {
    this.modulo.update(m => ({ ...m, arrotondamento: 0 }));
    this.imposta('arrotondamento', arrotondamentoDieci(this.calcolo().conIva));
  }

  /** Prezzo finale scritto a mano: anche così va ai 10 centesimi (10,03 → 10,00); la differenza è l'arrotondamento. */
  protected cambiaFinale(e: Event): void {
    const el = e.target as HTMLInputElement;
    const scritto = aiDieciCentesimi(leggiNumero(el.value));
    this.imposta('arrotondamento', cent(scritto - this.calcolo().conIva));
    el.value = numero(this.calcolo().etichetta);
  }

  /** ↑ € : arrotonda all'euro superiore. */
  protected arrotondaEuro(): void {
    this.imposta('arrotondamento', cent(this.modulo().arrotondamento + arrotondamentoEuro(this.calcolo().etichetta)));
  }

  /** 🧮 : ricalcola il ricarico perché il prezzo finale venga senza arrotondamento. */
  protected ricalcolaRicarico(): void {
    const c = this.calcolo(), base = c.costoNetto + c.spese;
    if (base <= 0) { this.avvisi.mostra('Serve il costo per calcolare il ricarico'); return; }
    const ricarico = Math.round((c.etichetta / (1 + this.percIvaScelta() / 100) / base - 1) * 10000) / 100;
    this.imposta('ricarico', ricarico);
    this.imposta('arrotondamento', 0);
    this.imposta('arrotondamento', cent(c.etichetta - this.calcolo().conIva));
  }

  // ---------- Materiali ----------
  protected aggiungiMateriale(): void {
    this.imposta('materiali', [...this.modulo().materiali, { materiale: '', fornitore: '', quantita: 1, info: '', costo: 0 }]);
    setTimeout(() => {
      const campi = document.querySelectorAll<HTMLInputElement>('.in-mat[data-k="materiale"]');
      campi[campi.length - 1]?.focus();
    });
  }

  protected cambiaMateriale(i: number, k: keyof MaterialeArticolo, e: Event): void {
    const el = e.target as HTMLInputElement;
    const lista = this.modulo().materiali.map(x => ({ ...x }));
    const m = lista[i];
    if (k === 'quantita') { m.quantita = Math.max(0, leggiNumero(el.value)); el.value = m.quantita ? this.percento(m.quantita) : ''; }
    else if (k === 'costo') { m.costo = Math.max(0, cent(leggiNumero(el.value))); el.value = m.costo ? numero(m.costo) : ''; }
    else m[k] = el.value.trim();
    this.imposta('materiali', lista);
  }

  protected togliMateriale(i: number): void {
    this.imposta('materiali', this.modulo().materiali.filter((_, j) => j !== i));
  }

  // ---------- Modifica / Annulla / Salva ----------
  protected modifica(): void {
    this.prima = { ...this.modulo(), materiali: this.modulo().materiali.map(x => ({ ...x })) };
    this.inModifica.set(true);
    this.modifiche.imposta(true);
  }

  protected annulla(): void {
    if (this.nuovo) { this.modifiche.imposta(false); void this.router.navigate(['/articoli']); return; }
    if (this.prima) this.modulo.set(this.prima);
    this.inModifica.set(false);
    this.modifiche.imposta(false);
  }

  protected chiudi(): void { void this.router.navigate(['/articoli']); }
  protected etichetta(): void { void this.router.navigate(['/etichette'], { queryParams: { cod: this.modulo().codice } }); }

  async salva(chiudi: boolean): Promise<void> {
    if (this.salvataggio()) return;   // doppio clic
    const m = this.modulo();
    if (!m.codice.trim()) { this.avvisi.mostra('Il codice è obbligatorio', true); return; }
    if (!m.descrizione.trim()) { this.avvisi.mostra('La descrizione è obbligatoria', true); return; }
    // codice nuovo: niente spazi doppi (nel gestionale attuale "F05/1-4        142" e "F051-4  142" creavano confusione)
    const codice = this.nuovo ? m.codice.trim().replace(/\s+/g, ' ') : m.codice;
    const a = this.articolo();
    const c = this.calcolo();
    const dati: Partial<Articolo> = {
      codice, descrizione: m.descrizione.trim(), attivo: m.attivo, aliquota_iva: m.iva, fornitore_id: m.fornitore,
      costo_lordo: m.costoLordo, sconto: m.sconto, costo_netto: c.costoNetto, prezzo_vendita: c.prezzoVendita, prezzo_vendita_ivato: c.etichetta,
      scorta_minima: Math.max(0, Math.round(m.scorta || 0)), anno_listino: Number(m.annoListino) || null,
      provenienza: m.provenienza, unita_misura: m.unita, scaffale: m.scaffale.trim() || null, annotazioni: m.annotazioni.trim() || null,
      ricarico: m.ricarico, spese_confezione: m.confezione, spese_imballaggio: m.imballaggio, spese_accessorie: m.accessorie,
      arrotondamento: m.arrotondamento, materiali: m.materiali.filter(x => x.materiale || x.fornitore || x.info || x.costo)
    };
    // il fornitore scelto a mano non è più "dedotto dal codice"
    if (!a || m.fornitore !== a.fornitore_id) dati.fornitore_dedotto = false;
    this.salvataggio.set(true);
    try {
      // codici quasi uguali e barcode già usati: si chiede prima di salvare (controllo nel database)
      try {
        const simili = await this.dati.simili(this.nuovo ? codice : null, m.barcode || null, a?.id ?? null);
        const avvisi = [
          ...simili.filter(s => s.motivo === 'barcode').map(s => `il barcode ${m.barcode} è già dell'articolo ${s.codice}: con la pistola non si saprebbe quale scegliere`),
          ...(simili.some(s => s.motivo === 'codice') ? [`esiste già un codice quasi uguale: ${simili.filter(s => s.motivo === 'codice').map(s => `"${s.codice}" (${s.descrizione})`).join(', ')}`] : [])
        ];
        if (avvisi.length && !confirm('Attenzione:\n• ' + avvisi.join('\n• ') + '\n\nSalvare lo stesso?')) return;
      } catch {
        /* il controllo non deve bloccare il salvataggio */
      }
      await this.dati.salva(a?.id ?? null, dati, a?.modificato_il ?? null);
      this.avvisi.mostra(`Articolo ${codice} salvato: prezzo in etichetta ${euro(c.etichetta)}`);
      this.modifiche.imposta(false);
      this.inModifica.set(false);
      if (chiudi) void this.router.navigate(['/articoli']);
      else if (this.nuovo || codice !== this.codiceRotta) void this.router.navigate(['/articoli', codice], { replaceUrl: true });
      else {
        const nuovoArt = await this.dati.leggi(codice);
        if (nuovoArt) { this.articolo.set(nuovoArt); this.modulo.set(this.daArticolo(nuovoArt)); this.storico.set(null); void this.caricaGiacenze(nuovoArt.id); }
      }
    } catch (e) {
      const t = e instanceof Error ? e.message : String(e);
      this.avvisi.mostra(/duplicate key|23505/.test(t) ? `Esiste già un articolo con il codice ${codice}` : 'Articolo non salvato: ' + t, true);
    } finally {
      this.salvataggio.set(false);
    }
  }

  // ---------- Movimenti ----------
  protected link(r: MovimentoArticolo): (string | number)[] | null { return percorsoMovimento(r.tipo, r.movimento_id); }
  protected anniLotti(r: MovimentoArticolo): string { return Object.keys(r.lotti ?? {}).join(', '); }
  protected q2(v: number): string { return (Math.round(v * 100) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2 }); }
  protected segnato(v: number): string { return v > 0 ? '+' + this.q2(v) : v < 0 ? '−' + this.q2(-v) : ''; }
  protected oraIt(iso: string): string {
    const d = new Date(iso);
    return `${d.toLocaleDateString('it-IT')} · ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
  }
}
