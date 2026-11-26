import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Fornitore, MovimentoDaSalvare, RpcFunzioni } from '../../core/models/database.types';
import { toNumber } from '../../core/models/database.types';
import { SupabaseService } from '../../core/services/supabase.service';
import { CercaFornitore } from '../../shared/cerca-fornitore';
import { excelMovimento, riepilogoFornitore } from '../../shared/excel';
import { cent, dataIt, leggiNumero, numero } from '../../shared/formato';
import { righeDestinatario, salvaPerStampa } from '../../shared/intestazioni';
import { RigheMovimentoComponent, type ConfigRighe, type RigaMovimento } from '../../shared/righe-movimento';
import { SchedaBase, TestaScheda } from '../../shared/scheda-movimento';
import { FornitoriSedeService, type FornitoreBreve } from '../fornitori/fornitori-sede.service';
import { MovimentiService } from './movimenti.service';

type OrdineAperto = RpcFunzioni['ordini_da_caricare']['ritorno'][number];
interface DocCarico { data: string; dataDoc: string; dataBolla: string; numBolla: string; porto: string; condPag: string; sped: string; tracking: string; causale: string; annot: string }
const SPESE = ['Spese', 'Spese trasporto', 'Spese fisse corriere', 'Spese % corriere', 'Spese accessorie', 'Spese volo'];

/**
 * Carico da fornitore (prototipo/carico.html). /carico/nuovo (anche ?ordine=N: già riempito con quello che manca dell'ordine),
 * /carico/12 salvato. Definitivo = la merce entra subito in giacenza; gli ordini collegati arrivati per intero diventano Evasi
 * nella stessa transazione (salva_carico). Prezzi di acquisto, etichette per riga, spese, stampa, Excel.
 */
@Component({
  selector: 'app-carico',
  imports: [TestaScheda, RigheMovimentoComponent, CercaFornitore, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './carico.html'
})
export class Carico extends SchedaBase {
  private readonly mov = inject(MovimentiService);
  private readonly supabase = inject(SupabaseService);
  private readonly fornitoriSede = inject(FornitoriSedeService);
  private readonly righeComp = viewChild(RigheMovimentoComponent);

  protected readonly SPESE = SPESE;
  protected readonly numero = numero;
  protected readonly dataIt = dataIt;
  protected readonly perEstero = computed(() => this.sede.sedeId() === 'cal-roma-estero');
  /** CAL SMM Roma non usa condizione di pagamento, sede che riceve e spedizione nei carichi (chiesto dall'utente, come nel prototipo) */
  protected readonly caricoSemplice = computed(() => this.sede.sedeId() === 'cal-smm-roma');

  protected readonly stato = signal('Definitivo');
  protected readonly statoSalvato = signal('Definitivo');
  protected readonly fornitore = signal<string | null>(null);
  protected readonly fornitori = signal<FornitoreBreve[]>([]);
  protected readonly doc = signal<DocCarico>({ data: this.oggi, dataDoc: this.oggi, dataBolla: '', numBolla: '', porto: 'Franco', condPag: '', sped: '', tracking: '', causale: '', annot: '' });
  protected readonly spese = signal<number[]>(SPESE.map(() => 0));
  protected readonly righe = signal<RigaMovimento[]>([]);
  protected readonly ordiniFornitore = signal<OrdineAperto[]>([]);
  protected readonly ordiniCollegati = signal<OrdineAperto[]>([]);
  protected readonly ordineScelto = signal<number | null>(null);
  protected readonly collegatoDaOrdine = signal(false);
  protected readonly storico = signal<{ id: number; quando: string; email: string | null; attivita: string; dettagli: string | null }[] | null>(null);
  protected readonly testoModifica = signal('Nuovo carico: scegli il fornitore e aggiungi gli articoli nella scheda Articoli.');

  protected readonly config: ConfigRighe = {
    etichettaPrezzo: 'Costo', prezzoDi: a => a.costo, nelMovimento: 'arrivati', spedita: true, senzaIva: true, ordinataDaOrdine: true, etichette: true, conFornitore: true,
    testoVuoto: 'Spara un barcode con la pistola, aggiungi col tasto ＋ o collega un ordine in Movimenti collegati.'
  };
  /** come il prototipo: totale di riga = arrivati × costo − sconto (senza IVA) */
  protected readonly totArt = computed(() => cent(this.righe().reduce((s, r) => s + (r.articolo ? cent(r.sped * r.prezzo * (1 - r.sconto / 100)) : 0), 0)));
  protected readonly pezzi = computed(() => this.righe().reduce((s, r) => s + (r.articolo ? r.sped : 0), 0));
  protected readonly totSpese = computed(() => cent(this.spese().reduce((s, v) => s + v, 0)));
  protected readonly anno = computed(() => Number(this.doc().data.slice(0, 4)) || new Date().getFullYear());
  protected readonly mancanti = computed(() => this.righe().filter(r => r.articolo && r.ordinata != null && r.sped < r.ordinata));
  protected readonly etichetteTot = computed(() => this.righe().reduce((s, r) => s + (r.articolo && r.sped > 0 ? r.etichette : 0), 0));

  constructor() {
    super();
    void this.avvia();
  }

  private ivaRiga(r: RigaMovimento): number { return r.iva === '04' ? 4 : r.iva === '0' || r.iva === '--' ? 0 : 22; }

  private async avvia(): Promise<void> {
    try {
      if (this.nuovo) {
        this.fornitori.set(await this.fornitoriSede.elenco(this.sedeId));
        const ordine = Number(this.query.get('ordine'));
        if (ordine) await this.apriOrdine(ordine);
        return;
      }
      const letto = await this.mov.leggi(this.id()!, this.sedeId);
      if (!letto || letto.mov.tipo !== 'carico_fornitore') { this.errore.set(`Carico #${this.id()} non trovato`); return; }
      const m = letto.mov;
      this.versione = m.modificato_il;
      this.stato.set(m.stato); this.statoSalvato.set(m.stato);
      this.fornitore.set(m.fornitore_id);
      this.doc.set({ data: m.data_movimento, dataDoc: m.data_documento ?? '', dataBolla: m.data_bolla ?? '', numBolla: m.numero_documento ?? '', porto: m.porto ?? 'Franco',
        condPag: m.condizione_pagamento ?? '', sped: m.spedizioniere ?? '', tracking: m.tracking ?? '', causale: m.causale ?? '', annot: m.annotazioni ?? '' });
      this.spese.set(SPESE.map((_, i) => (i === 0 ? toNumber(m.spese) : 0)));
      this.righe.set(letto.righe.map(r => ({ ...r, iva: r.articolo ? (r.articolo.iva === 4 ? '04' : r.articolo.iva === 0 ? '0' : '22') : '22' })));
      this.collegatoDaOrdine.set(letto.righe.some(r => r.ordineRigaId));
      this.fornitori.set(await this.fornitoriSede.elenco(this.sedeId, [m.fornitore_id]));
      this.testoModifica.set('Stai modificando il carico. Ricordati di salvare.');
    } catch (e) {
      this.errore.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.caricamento.set(false);
    }
  }

  protected campo(k: keyof DocCarico, e: Event): void { const v = this.testo(e); this.doc.update(d => ({ ...d, [k]: v })); }
  protected cambiaSpesa(i: number, e: Event): void { const v = cent(leggiNumero(this.testo(e))); this.spese.update(s => s.map((x, j) => (j === i ? v : x))); }
  protected nomeFornitore(): string { return this.fornitori().find(f => f.id === this.fornitore())?.nome ?? ''; }

  /** Fornitore scelto: si leggono i suoi ordini ancora da arrivare (per collegarli). */
  protected async scegliFornitore(id: string | null): Promise<void> {
    this.fornitore.set(id);
    this.ordineScelto.set(null);
    if (!id || !this.nuovo) { this.ordiniFornitore.set([]); return; }
    try {
      const tutti = await this.supabase.rpc('ordini_da_caricare', { p_sede: this.sedeId });
      this.ordiniFornitore.set(tutti.filter(o => o.fornitore_id === id && !this.ordiniCollegati().some(c => c.id === o.id)));
    } catch (e) { this.avvisi.errore(e); }
  }

  /** ?ordine=N (dal riquadro dell'elenco o dalla Dashboard): fornitore e ordine già collegati, Spedita = quanto manca. */
  private async apriOrdine(ordineId: number): Promise<void> {
    const tutti = await this.supabase.rpc('ordini_da_caricare', { p_sede: this.sedeId });
    const o = tutti.find(x => x.id === ordineId);
    if (!o) { this.avvisi.mostra(`L'ordine #${ordineId} è già arrivato tutto: non c'è più niente da caricare`, true); return; }
    // il fornitore dell'ordine c'è sempre, anche se non è tra quelli della sede (es. Magazzino Centrale → Clarisse, fornitore di CAL SMM Roma)
    if (o.fornitore_id && !this.fornitori().some(f => f.id === o.fornitore_id)) this.fornitori.set(await this.fornitoriSede.elenco(this.sedeId, [o.fornitore_id]));
    await this.scegliFornitore(o.fornitore_id);
    await this.collega(o, true);
    this.testoModifica.set(`Carico dall'ordine ${o.prot} del ${dataIt(o.data)}: le quantità sono quelle ancora da arrivare. Correggile con − / +, metti lo sconto riga per riga o togli con il cestino quello che non è arrivato, poi salva.`);
  }

  protected async collegaScelto(): Promise<void> {
    const o = this.ordiniFornitore().find(x => x.id === this.ordineScelto());
    if (o) await this.collega(o, false);
  }

  /** Collegato da "Movimenti collegati": Spedita = 0, si riempie sparando la merce; dal riquadro: Spedita = quanto manca. */
  private async collega(o: OrdineAperto, precompila: boolean): Promise<void> {
    if (this.ordiniCollegati().some(c => c.id === o.id)) { this.avvisi.mostra(`L'ordine ${o.prot} è già collegato`); return; }
    try {
      const righeOrdine = await this.supabase.rpc('ordine_da_caricare_righe', { p_ordine: o.id });
      const art = await this.mov.articoli([...new Set(righeOrdine.map(r => r.articolo_id))], this.sedeId);
      let pos = this.righe().reduce((m, r) => Math.max(m, r.pos), 0);
      const nuove: RigaMovimento[] = righeOrdine.filter(r => art.has(r.articolo_id)).map(r => {
        const a = art.get(r.articolo_id)!, residuo = toNumber(r.residuo);
        return { pos: ++pos, articolo: a, qta: residuo, sped: precompila ? residuo : 0, prezzo: cent(toNumber(r.prezzo)), sconto: 0,
          iva: a.iva === 4 ? '04' : a.iva === 0 ? '0' : '22', etichette: precompila ? residuo : 0, etichetteMan: false, ordinata: residuo,
          ordineRigaId: r.ordine_riga_id, oltreAttesa: false, ora: new Date().toISOString(), giaScaricati: 0 };
      });
      this.righe.update(l => [...l.filter(r => r.articolo), ...nuove]);
      this.ordiniCollegati.update(l => [...l, o]);
      this.ordiniFornitore.update(l => l.filter(x => x.id !== o.id));
      this.ordineScelto.set(null);
      this.tab.set('articoli');
      this.avvisi.mostra(precompila ? `Carico riempito con l'ordine ${o.prot}: correggi quantità e sconti, togli quello che non è arrivato`
        : `Ordine ${o.prot} collegato: spara la merce arrivata nella scheda Articoli`);
    } catch (e) { this.avvisi.errore(e); }
  }

  protected modificaCarico(): void {
    this.prima = { stato: this.stato(), fornitore: this.fornitore(), doc: { ...this.doc() }, spese: [...this.spese()], righe: this.righe().map(r => ({ ...r })) };
    this.entraInModifica();
  }
  private prima: { stato: string; fornitore: string | null; doc: DocCarico; spese: number[]; righe: RigaMovimento[] } | null = null;
  protected annullaModifica(): void {
    if (this.nuovo) {
      if (!this.righe().some(r => r.articolo) || confirm('Uscire senza salvare il nuovo carico?')) { this.esciDaModifica(); void this.router.navigateByUrl('/movimenti/carichi-fornitori'); }
      return;
    }
    if (this.prima) { this.stato.set(this.prima.stato); this.fornitore.set(this.prima.fornitore); this.doc.set(this.prima.doc); this.spese.set(this.prima.spese); this.righe.set(this.prima.righe); }
    this.esciDaModifica();
  }

  protected salva(chiudi: boolean): void {
    void this.conSalvataggio(async () => {
      this.righeComp()?.togliVuote();
      if (!this.fornitore()) { this.avvisi.mostra('Scegli il fornitore', true); this.tab.set('dettagli'); return; }
      if (!this.righe().some(r => r.articolo && r.sped > 0)) { this.avvisi.mostra('Aggiungi almeno un articolo arrivato nella scheda Articoli', true); this.tab.set('articoli'); return; }
      const d = this.doc(), t = (s: string): string | null => s.trim() || null;
      const m: MovimentoDaSalvare = {
        tipo: 'carico_fornitore', stato: this.stato() as MovimentoDaSalvare['stato'], sede_id: this.sedeId, fornitore_id: this.fornitore(),
        numero_documento: t(d.numBolla), data_movimento: d.data || this.oggi, data_documento: d.dataDoc || null, data_bolla: d.dataBolla || null,
        causale: t(d.causale), annotazioni: t(d.annot), porto: d.porto, condizione_pagamento: t(d.condPag), spedizioniere: t(d.sped), tracking: t(d.tracking),
        spese: this.totSpese()
      };
      const righe = this.mov.daSalvare(this.righe(), { spedita: true, conOrdinata: true });
      const ordini = [...new Set([...this.ordiniCollegati().map(o => o.id)])];
      const nuovoId = await this.mov.salvaCarico(this.id(), m, righe, this.versione, ordini);
      this.avvisi.mostra(m.stato === 'Definitivo' ? `Carico salvato: ${this.pezzi()} pezzi caricati in giacenza` : `Carico salvato come ${m.stato.toLowerCase()}: la giacenza non cambia finché non è definitivo`);
      this.dopoSalvataggio('/carico', nuovoId, chiudi, '/movimenti/carichi-fornitori');
    });
  }

  protected apriTab(t: string): void {
    this.tab.set(t);
    if (t === 'storico' && this.storico() === null && this.id()) this.mov.storico(this.id()!).then(s => this.storico.set(s), () => this.storico.set([]));
  }

  /** Etichette: un'etichetta per pezzo (colonna Etichette), con l'anno del carico. */
  protected etichette(): void {
    const righe = this.righe().filter(r => r.articolo && r.sped > 0).map(r => ({
      art: { codice: r.articolo!.codice, descr: r.articolo!.descrizione, barcode: r.articolo!.barcode ?? '', costo: r.prezzo, prezzo: r.articolo!.prezzo }, n: r.etichette, anno: this.anno()
    }));
    if (!righe.length) { this.avvisi.mostra('Non ci sono articoli arrivati'); return; }
    salvaPerStampa('etichette', { titolo: this.id() ? `Carico #${this.id()}` : 'Nuovo carico', ritorno: this.router.url, righe });
    void this.router.navigate(['/etichette'], { queryParams: { da: 'sessione' } });
  }

  private async fornitoreCompleto(): Promise<Fornitore | null> {
    const id = this.fornitore();
    if (!id) return null;
    const { data } = await this.supabase.client.from('fornitori').select('*').eq('id', id).maybeSingle();
    return (data as Fornitore | null) ?? null;
  }

  /** Stampa su carta intestata come quella del gestionale attuale: importo di riga IVA inclusa ai 5 centesimi. */
  protected async stampa(): Promise<void> {
    const righe = this.righe().filter(r => r.articolo && r.sped > 0);
    if (!righe.length) { this.avvisi.mostra('Non ci sono articoli arrivati da stampare'); return; }
    const f = await this.fornitoreCompleto();
    const importo = (r: RigaMovimento): number => Math.round(r.sped * r.prezzo * (1 - (r.sconto || 0) / 100) * (1 + this.ivaRiga(r) / 100) * 20 + 1e-6) / 20;
    const totArt = cent(righe.reduce((s, r) => s + importo(r), 0));
    const d = this.doc();
    salvaPerStampa('stampa', {
      titolo: 'Carico da Fornitore', sede: this.nomeSede,
      info: ([['Data', dataIt(d.dataDoc || d.data)], ['Anno', String(this.anno())]] as [string, string][])
        .concat(d.numBolla ? [['N. Bolla', d.numBolla]] : [], d.dataBolla ? [['Data Bolla', dataIt(d.dataBolla)]] : []),
      destinatario: righeDestinatario(f, f?.ragione_sociale ?? this.nomeFornitore()),
      colonne: [{ k: 'n', t: '#' }, { k: 'cod', t: 'Codice', cod: true }, { k: 'descr', t: 'Descrizione' }, { k: 'qta', t: 'Quantità', num: true },
        { k: 'prezzo', t: 'Pr. Unit.', num: true }, { k: 'sconto', t: 'Sconto %', num: true }, { k: 'iva', t: 'IVA', num: true }, { k: 'importo', t: 'Importo', num: true }],
      righe: righe.map((r, i) => ({ n: i + 1, cod: r.articolo!.codice, descr: r.articolo!.descrizione,
        qta: r.sped.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + (r.articolo!.unita === 'Metri' ? ' mt' : ''), prezzo: numero(r.prezzo),
        sconto: r.sconto ? r.sconto.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : '', iva: this.ivaRiga(r) + '%', importo: numero(importo(r)) })),
      totali: ([['Totale Articoli', numero(totArt)]] as [string, string][]).concat(this.totSpese() ? [['+ Spese', numero(this.totSpese())]] : [], [['= Totale Complessivo', numero(totArt + this.totSpese())]]),
      note: [this.perEstero() ? d.causale.trim() : '', d.annot.trim()].filter(Boolean).join('\n'),
      ritorno: this.router.url
    });
    void this.router.navigate(['/stampa']);
  }

  protected async excel(): Promise<void> {
    const righe = this.righe().filter(r => r.articolo && r.sped > 0);
    if (!righe.length) { this.avvisi.mostra('Non ci sono articoli arrivati da mettere nel file Excel'); return; }
    const d = this.doc();
    excelMovimento({ sede: this.nomeSede, tipo: 'Carico da Fornitore', numero: this.id(),
      riepilogo: [['Data Documento', dataIt(d.dataDoc || d.data)], ['Numero Bolla', d.numBolla], ['Data Bolla', d.dataBolla ? dataIt(d.dataBolla) : ''],
        ...riepilogoFornitore(await this.fornitoreCompleto(), this.nomeFornitore())],
      spese: SPESE.map((s, i): [string, number] => [s, this.spese()[i]]),
      righe: righe.map(r => ({ codice: r.articolo!.codice, descr: r.articolo!.descrizione, anno: this.anno(), prezzo: r.prezzo, sconto: r.sconto, qta: r.sped, unita: r.articolo!.unita, iva: this.ivaRiga(r) })) });
  }
}
