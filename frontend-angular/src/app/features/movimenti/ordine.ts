import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Fornitore, InevasoInAttesa, MovimentoDaSalvare } from '../../core/models/database.types';
import { toNumber } from '../../core/models/database.types';
import { SupabaseService } from '../../core/services/supabase.service';
import { CercaFornitore } from '../../shared/cerca-fornitore';
import { excelMovimento, riepilogoFornitore } from '../../shared/excel';
import { cent, dataIt, leggiNumero, numero, SEDI_ESTERE, siglaSede } from '../../shared/formato';
import { righeDestinatario, salvaPerStampa } from '../../shared/intestazioni';
import { percIvaRiga, RigheMovimentoComponent, totaleRiga, type ArticoloRiga, type ConfigRighe, type RigaMovimento } from '../../shared/righe-movimento';
import { SchedaBase, TestaScheda } from '../../shared/scheda-movimento';
import { FornitoriSedeService, type FornitoreBreve } from '../fornitori/fornitori-sede.service';
import { MovimentiService } from './movimenti.service';

interface DocOrdine { data: string; numOrdine: string; dataBolla: string; porto: string; condPag: string; causale: string; annot: string }
const SPESE = ['Spese', 'Spese trasporto', 'Spese accessorie'];

/**
 * Ordine a fornitore (prototipo/ordine.html). Fornitore obbligatorio; si cercano i suoi articoli (anche con la pistola).
 * Se il fornitore è una sede (es. MAGAZZINO CENTRALE) l'ordine arriva a quella sede quando è Definitivo, che lo prepara con un
 * trasferimento; quello che manca resta negli INEVASI. Niente doppi ordini: gli articoli già in attesa non entrano
 * ("Va bene / Ne servono di più": i pezzi aggiunti lo stesso hanno l'etichetta IN PIÙ).
 */
@Component({
  selector: 'app-ordine',
  imports: [TestaScheda, RigheMovimentoComponent, CercaFornitore, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ordine.html'
})
export class Ordine extends SchedaBase {
  private readonly mov = inject(MovimentiService);
  private readonly supabase = inject(SupabaseService);
  private readonly fornitoriSede = inject(FornitoriSedeService);
  private readonly righeComp = viewChild(RigheMovimentoComponent);

  protected readonly SPESE = SPESE;
  protected readonly numero = numero;
  protected readonly dataIt = dataIt;
  protected readonly toNumber = toNumber;
  protected readonly perEstero = computed(() => this.sede.sedeId() === 'cal-roma-estero');
  protected readonly estera = computed(() => SEDI_ESTERE.includes(this.nomeSede));

  protected readonly stato = signal('Definitivo');   // come il prototipo: un ordine nuovo parte Definitivo (inviato)
  protected readonly statoSalvato = signal('Definitivo');
  protected readonly protocollo = signal<string | null>(null);
  protected readonly fornitore = signal<string | null>(null);
  protected readonly fornitori = signal<FornitoreBreve[]>([]);
  protected readonly doc = signal<DocOrdine>({ data: this.oggi, numOrdine: '', dataBolla: '', porto: 'Franco', condPag: '', causale: '', annot: '' });
  protected readonly spese = signal<number[]>(SPESE.map(() => 0));
  protected readonly righe = signal<RigaMovimento[]>([]);
  protected readonly inAttesa = signal<InevasoInAttesa[]>([]);
  protected readonly attesaAperta = signal(false);
  protected readonly chiedi = signal<{ a: ArticoloRiga; n: number } | null>(null);
  protected readonly storico = signal<{ id: number; quando: string; email: string | null; attivita: string; dettagli: string | null }[] | null>(null);

  protected readonly fornitoreScelto = computed(() => this.fornitori().find(f => f.id === this.fornitore()) ?? null);
  /** sede che riceve l'ordine quando il fornitore è una sede */
  protected readonly sedeFornitrice = computed(() => this.fornitoreScelto()?.sede_collegata ?? null);
  protected readonly nomeSedeFornitrice = computed(() => this.sede.sedi().find(s => s.id === this.sedeFornitrice())?.nome ?? this.fornitoreScelto()?.nome ?? '');
  protected readonly attesaPerArticolo = computed(() => {
    const m = new Map<string, number>();
    this.inAttesa().forEach(r => m.set(r.articolo_id, (m.get(r.articolo_id) ?? 0) + toNumber(r.residuo)));
    return m;
  });
  protected readonly config: ConfigRighe = { etichettaPrezzo: 'Costo', prezzoDi: a => a.costo, nelMovimento: "nell'ordine", senzaAnno: true, conFornitore: true };
  protected readonly totArt = computed(() => cent(this.righe().reduce((s, r) => s + (r.articolo ? totaleRiga(r, this.config) : 0), 0)));
  protected readonly pezzi = computed(() => this.righe().reduce((s, r) => s + (r.articolo ? r.qta : 0), 0));
  protected readonly totSpese = computed(() => cent(this.spese().reduce((s, v) => s + v, 0)));
  protected readonly modificabile = computed(() => ['Provvisorio', 'Definitivo'].includes(this.statoSalvato()));
  protected readonly notaArticolo = (a: ArticoloRiga): string => { const n = this.attesaPerArticolo().get(a.id); return n ? `già in attesa: ${n}` : ''; };
  protected readonly fermaArticolo = (a: ArticoloRiga, n: number): boolean => {
    if (!this.attesaPerArticolo().get(a.id)) return false;
    this.chiedi.set({ a, n });
    return true;
  };

  constructor() {
    super();
    void this.avvia();
  }

  private async avvia(): Promise<void> {
    try {
      await this.sede.caricaSedi();
      if (this.nuovo) { await this.caricaFornitori([]); return; }
      const letto = await this.mov.leggi(this.id()!, this.sedeId);
      if (!letto || letto.mov.tipo !== 'ordine_fornitore') { this.errore.set(`Ordine #${this.id()} non trovato`); return; }
      const m = letto.mov;
      this.versione = m.modificato_il;
      this.stato.set(m.stato); this.statoSalvato.set(m.stato); this.protocollo.set(m.protocollo);
      this.doc.set({ data: m.data_movimento, numOrdine: m.numero_documento ?? '', dataBolla: m.data_bolla ?? '', porto: m.porto ?? 'Franco',
        condPag: m.condizione_pagamento ?? '', causale: m.causale ?? '', annot: m.annotazioni ?? '' });
      this.spese.set(SPESE.map((_, i) => (i === 0 ? toNumber(m.spese) : 0)));
      this.righe.set(letto.righe.map(r => ({ ...r, iva: r.articolo ? (r.articolo.iva === 4 ? '04' : r.articolo.iva === 0 ? '0' : '22') : '22' })));
      await this.caricaFornitori([m.fornitore_id]);
      this.fornitore.set(m.fornitore_id);
      await this.leggiAttesa();
    } catch (e) {
      this.errore.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.caricamento.set(false);
    }
  }

  /** Fornitori della sede; nessuna sede può fare un ordine a se stessa (resta solo negli ordini vecchi già fatti così). */
  private async caricaFornitori(tenere: (string | null)[]): Promise<void> {
    const l = await this.fornitoriSede.elenco(this.sedeId, tenere);
    this.fornitori.set(l.filter(f => f.sede_collegata !== this.sedeId || tenere.includes(f.id)));
  }

  /** Fornitore che è una sede: articoli ancora in attesa dei nostri ordini precedenti (inevasi), per non riordinarli. */
  private async leggiAttesa(): Promise<void> {
    this.inAttesa.set([]);
    if (!this.sedeFornitrice()) return;
    try {
      const nome = this.nomeSedeFornitrice();
      const l = await this.supabase.rpc('inevasi_in_attesa', { p_sede: this.sedeId });
      this.inAttesa.set(l.filter(r => r.sede === nome && r.ordine_id !== this.id()));
    } catch (e) { this.avvisi.errore(e); }
  }

  protected async scegliFornitore(id: string | null): Promise<void> {
    this.fornitore.set(id);
    await this.leggiAttesa();
  }

  protected campo(k: keyof DocOrdine, e: Event): void { const v = this.testo(e); this.doc.update(d => ({ ...d, [k]: v })); }
  protected cambiaSpesa(i: number, e: Event): void { const v = cent(leggiNumero(this.testo(e))); this.spese.update(s => s.map((x, j) => (j === i ? v : x))); }
  protected sigla(): string { return siglaSede(this.nomeSedeFornitrice()); }

  /** "Va bene, non lo aggiungo" / "Ne servono di più" (aggiunto lo stesso, con l'etichetta IN PIÙ). */
  protected rispondiAttesa(aggiungi: boolean): void {
    const c = this.chiedi();
    this.chiedi.set(null);
    if (!c) return;
    if (aggiungi) this.righeComp()?.aggiungiLoStesso(c.a, c.n);
    else this.avvisi.mostra('Non aggiunto: è già in attesa');
  }
  protected righeAttesaDi(a: ArticoloRiga): InevasoInAttesa[] { return this.inAttesa().filter(r => r.articolo_id === a.id); }

  private prima: { stato: string; fornitore: string | null; doc: DocOrdine; spese: number[]; righe: RigaMovimento[] } | null = null;
  protected modificaOrdine(): void {
    this.prima = { stato: this.stato(), fornitore: this.fornitore(), doc: { ...this.doc() }, spese: [...this.spese()], righe: this.righe().map(r => ({ ...r })) };
    this.entraInModifica();
  }
  protected annullaModifica(): void {
    if (this.nuovo) {
      if (!this.righe().some(r => r.articolo) || confirm('Uscire senza salvare il nuovo ordine?')) { this.esciDaModifica(); void this.router.navigateByUrl('/movimenti/ordini-fornitori'); }
      return;
    }
    if (this.prima) { this.stato.set(this.prima.stato); this.fornitore.set(this.prima.fornitore); this.doc.set(this.prima.doc); this.spese.set(this.prima.spese); this.righe.set(this.prima.righe); }
    this.esciDaModifica();
  }

  protected salva(chiudi: boolean): void {
    void this.conSalvataggio(async () => {
      this.righeComp()?.togliVuote();
      const f = this.fornitoreScelto();
      if (!f) { this.avvisi.mostra('Prima scegli il fornitore: è obbligatorio', true); this.tab.set('dettagli'); return; }
      if (!this.righe().some(r => r.articolo)) { this.avvisi.mostra("Aggiungi almeno un articolo all'ordine", true); this.tab.set('articoli'); return; }
      const doppi = this.righe().filter(r => r.articolo && this.attesaPerArticolo().get(r.articolo.id) && !r.oltreAttesa);
      if (doppi.length && !confirm(`Questi articoli sono già in attesa dal ${f.nome} (inevasi di ordini precedenti):\n\n` +
        doppi.map(r => `• ${r.articolo!.codice} – ${r.articolo!.descrizione}: ${this.attesaPerArticolo().get(r.articolo!.id)} in attesa, ora ne ordini ${r.qta}`).join('\n') +
        "\n\nOK = ordinali lo stesso (si aggiungono a quelli in attesa)\nAnnulla = torna all'ordine per toglierli o cambiare le quantità")) { this.tab.set('articoli'); return; }
      const d = this.doc(), t = (s: string): string | null => s.trim() || null;
      const m: MovimentoDaSalvare = {
        tipo: 'ordine_fornitore', stato: this.stato() as MovimentoDaSalvare['stato'], sede_id: this.sedeId, fornitore_id: f.id,
        data_movimento: d.data || this.oggi, data_documento: d.data || this.oggi, causale: t(d.causale), annotazioni: t(d.annot), porto: d.porto,
        condizione_pagamento: t(d.condPag), numero_documento: t(d.numOrdine), data_bolla: d.dataBolla || null, spese: this.totSpese()
      };
      const righe = this.mov.daSalvare(this.righe()).map(r => ({ ...r, etichette: 0 }));
      const nuovoId = await this.mov.salva(this.id(), m, righe, this.versione);
      this.avvisi.mostra(m.stato === 'Definitivo' && f.sede_collegata ? `Ordine inviato: il ${f.nome} lo trova nella sua Dashboard`
        : m.stato === 'Definitivo' ? 'Ordine salvato' : f.sede_collegata ? `Ordine salvato come provvisorio: il ${f.nome} non lo vede finché non lo rendi definitivo` : 'Ordine salvato come provvisorio: si può completare nei prossimi giorni');
      this.dopoSalvataggio('/ordine', nuovoId, chiudi, '/movimenti/ordini-fornitori');
    });
  }

  protected apriTab(t: string): void {
    this.tab.set(t);
    if (t === 'storico' && this.storico() === null && this.id()) this.mov.storico(this.id()!).then(s => this.storico.set(s), () => this.storico.set([]));
  }

  private async fornitoreCompleto(): Promise<Fornitore | null> {
    const id = this.fornitore();
    if (!id) return null;
    const { data } = await this.supabase.client.from('fornitori').select('*').eq('id', id).maybeSingle();
    return (data as Fornitore | null) ?? null;
  }

  /** Stampa su carta intestata: numero progressivo/anno, importo di riga IVA inclusa ai 5 centesimi. */
  protected async stampa(): Promise<void> {
    const lista = this.righe().filter(r => r.articolo && r.qta > 0);
    if (!lista.length) { this.avvisi.mostra('Non ci sono articoli da stampare'); return; }
    const forn = await this.fornitoreCompleto();
    const d = this.doc(), anno = d.data.slice(0, 4);
    const importo = (r: RigaMovimento): number => Math.round(totaleRiga(r, this.config) * 20 + 1e-6) / 20;
    const totArt = cent(lista.reduce((s, r) => s + importo(r), 0));
    const prot = this.protocollo();
    const numeroOrd = prot ? (/^\d{4}-0*(\d+)$/.test(prot) ? prot.replace(/^(\d{4})-0*(\d+)$/, '$2/$1') : prot) : this.id() ? `${this.id()}/${anno}` : '';
    salvaPerStampa('stampa', {
      titolo: 'Ordine a Fornitore', sede: this.nomeSede,
      info: ([['Data', dataIt(d.data)]] as [string, string][]).concat(numeroOrd ? [['Numero', numeroOrd]] : [], d.numOrdine ? [['N. ordine', d.numOrdine]] : [], d.dataBolla ? [['Data Bolla', dataIt(d.dataBolla)]] : []),
      destinatario: righeDestinatario(forn, forn?.ragione_sociale ?? this.fornitoreScelto()?.nome ?? ''),
      colonne: [{ k: 'n', t: '#' }, { k: 'cod', t: 'Codice', cod: true }, { k: 'descr', t: 'Descrizione' }, { k: 'qta', t: 'Quantità', num: true },
        { k: 'prezzo', t: 'Pr. Unit.', num: true }, { k: 'sconto', t: 'Sconto %', num: true }, { k: 'iva', t: 'IVA', num: true }, { k: 'importo', t: 'Importo', num: true }],
      righe: lista.map((r, i) => ({ n: i + 1, cod: r.articolo!.codice, descr: r.articolo!.descrizione,
        qta: r.qta.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + (r.articolo!.unita === 'Metri' ? ' mt' : ''), prezzo: numero(r.prezzo),
        sconto: r.sconto ? r.sconto.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : '', iva: percIvaRiga(r.iva) + '%', importo: numero(importo(r)) })),
      totali: ([['Totale Articoli', numero(totArt)]] as [string, string][]).concat(this.totSpese() ? [['+ Spese', numero(this.totSpese())]] : [], [['= Totale Complessivo', numero(totArt + this.totSpese())]]),
      note: [this.perEstero() ? d.causale.trim() : '', d.annot.trim()].filter(Boolean).join('\n'),
      ritorno: this.router.url
    });
    void this.router.navigate(['/stampa']);
  }

  protected async excel(): Promise<void> {
    const lista = this.righe().filter(r => r.articolo && r.qta > 0);
    if (!lista.length) { this.avvisi.mostra('Non ci sono articoli da mettere nel file Excel'); return; }
    excelMovimento({ sede: this.nomeSede, tipo: 'Ordine a Fornitore', numero: this.id(),
      riepilogo: [['Data Documento', dataIt(this.doc().data)], ['Numero Ordine', this.doc().numOrdine], ...riepilogoFornitore(await this.fornitoreCompleto(), this.fornitoreScelto()?.nome ?? '')],
      spese: SPESE.map((s, i): [string, number] => [s, this.spese()[i]]),
      righe: lista.map(r => ({ codice: r.articolo!.codice, descr: r.articolo!.descrizione, anno: r.articolo!.anno, prezzo: r.prezzo, sconto: r.sconto, qta: r.qta, unita: r.articolo!.unita, iva: percIvaRiga(r.iva) })) });
  }
}
