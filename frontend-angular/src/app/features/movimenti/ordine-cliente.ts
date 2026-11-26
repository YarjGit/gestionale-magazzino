import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Cliente, MovimentoDaSalvare } from '../../core/models/database.types';
import { toNumber } from '../../core/models/database.types';
import { RegistroService } from '../../core/services/registro.service';
import { ErroreDatabase, SupabaseService } from '../../core/services/supabase.service';
import { CercaFornitore } from '../../shared/cerca-fornitore';
import { excelMovimento } from '../../shared/excel';
import { cent, dataIt, numero, SEDI_ESTERE } from '../../shared/formato';
import { righeDestinatario, salvaDdt } from '../../shared/intestazioni';
import { percIvaRiga, RigheMovimentoComponent, type ConfigRighe, type RigaMovimento } from '../../shared/righe-movimento';
import { SchedaBase, TestaScheda } from '../../shared/scheda-movimento';
import type { FornitoreBreve } from '../fornitori/fornitori-sede.service';
import { MovimentiService } from './movimenti.service';

interface DocCliente { data: string; numBolla: string; dataBolla: string; colli: string; contenuto: string; peso: string; porto: string; corriere: string; tracking: string; causale: string; annot: string }
type CampoNuovo = 'nome' | 'indirizzo' | 'cap' | 'citta' | 'provincia' | 'telefono' | 'piva';

/**
 * Ordine da cliente con DDT (prototipo/ordine-cliente.html), con UN solo intestatario: il cliente. L'ordine non scarica la
 * giacenza: prima del DDT "Vuoi scalare la merce dalla giacenza?" (Sì = scarico a cliente collegato, una volta sola, e ordine
 * Evaso: scala_ordine_cliente; No = niente). Dopo il Sì gli articoli non si cambiano più (si salvano solo i dati del documento).
 * La stessa scheda fa lo Scarico a cliente (/ordine-cliente/nuovo?tipo=scarico): toglie la merce appena è Definitivo e non
 * lascia mandare più della giacenza. Numero di bolla "N/anno" dato dal database; "Sconto cliente %" su tutte le righe.
 */
@Component({
  selector: 'app-ordine-cliente',
  imports: [TestaScheda, RigheMovimentoComponent, CercaFornitore, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ordine-cliente.html',
  styles: `
    .cliente-ddt { margin-top: 8px; padding: 10px 12px; border: 1px dashed #b9cdf0; border-radius: 10px; background: #f6f9ff; font-size: .85rem; line-height: 1.5; }
    .cliente-ddt.manca { border-color: #f1a5a5; background: #fff6f6; color: #b42318; }
    .cliente-ddt b { display: block; color: var(--muted); font-size: .7rem; letter-spacing: .05em; }
  `
})
export class OrdineCliente extends SchedaBase {
  private readonly mov = inject(MovimentiService);
  private readonly supabase = inject(SupabaseService);
  private readonly registro = inject(RegistroService);
  private readonly righeComp = viewChild(RigheMovimentoComponent);
  protected readonly numero = numero;

  protected readonly scarico = signal(this.query.get('tipo') === 'scarico');
  protected readonly stato = signal('Definitivo');
  protected readonly statoSalvato = signal('Definitivo');
  protected readonly cliente = signal<string | null>(null);
  protected readonly clienti = signal<Cliente[]>([]);
  protected readonly doc = signal<DocCliente>({ data: this.oggi, numBolla: '', dataBolla: this.oggi, colli: '', contenuto: 'ARREDI SACRI', peso: '', porto: 'Franco', corriere: '', tracking: '', causale: '', annot: '' });
  protected readonly sconto = signal(0);
  protected readonly righe = signal<RigaMovimento[]>([]);
  protected readonly scaricoId = signal<number | null>(null);
  protected readonly ordineOrigine = signal<number | null>(null);
  protected readonly inventario = signal<number | null>(null);
  protected readonly chiediScala = signal(false);
  protected readonly nuovoCliente = signal<Record<CampoNuovo, string> | null>(null);

  protected readonly estera = computed(() => SEDI_ESTERE.includes(this.nomeSede));
  protected readonly nome = computed(() => (this.scarico() ? 'Scarico a cliente' : 'Ordine da cliente'));
  protected readonly elenco = computed(() => (this.scarico() ? '/movimenti/scarichi-clienti' : '/movimenti/ordini-clienti'));
  protected readonly clientiBrevi = computed<FornitoreBreve[]>(() => this.clienti().map(c => ({ id: c.id, codice: c.codice, nome: c.nome, sede_collegata: null })));
  protected readonly clienteScelto = computed(() => this.clienti().find(c => c.id === this.cliente()) ?? null);
  protected readonly righeDdt = computed(() => { const c = this.clienteScelto(); return c ? righeDestinatario(c, c.nome) : []; });
  protected readonly config = computed<ConfigRighe>(() => ({
    etichettaPrezzo: 'Prezzo', ivaInclusa: true, nelMovimento: this.scarico() ? 'nello scarico' : "nell'ordine", verboUscita: 'mandare',
    prezzoDi: a => a.prezzo, limiteGiacenza: this.scarico(), testoVuoto: 'Spara i barcode con la pistola, oppure usa il tasto ＋ e scrivi il codice.'
  }));
  protected readonly totale = computed(() => cent(this.righe().reduce((s, r) => s + (r.articolo ? cent(r.qta * r.prezzo * (1 - r.sconto / 100)) : 0), 0)));
  protected readonly pezzi = computed(() => this.righe().reduce((s, r) => s + (r.articolo ? r.qta : 0), 0));
  /** ordine già scalato: le sue righe sono collegate allo scarico e non si sostituiscono */
  protected readonly righeBloccate = computed(() => !this.scarico() && !!this.scaricoId() && !this.nuovo);

  constructor() {
    super();
    void this.avvia();
  }

  private async avvia(): Promise<void> {
    try {
      const { data, error } = await this.supabase.client.from('clienti').select('*').order('nome').limit(5000);
      if (error) throw new ErroreDatabase(error);
      this.clienti.set((data ?? []) as Cliente[]);
      if (this.nuovo) {
        if (this.scarico()) this.mov.inventarioInCorso(this.sedeId).then(i => this.inventario.set(i?.id ?? null), () => undefined);
        return;
      }
      const letto = await this.mov.leggi(this.id()!, this.sedeId);
      if (!letto || !['ordine_cliente', 'scarico_cliente'].includes(letto.mov.tipo)) { this.errore.set(`Movimento #${this.id()} non trovato`); return; }
      const m = letto.mov;
      this.scarico.set(m.tipo === 'scarico_cliente');
      this.versione = m.modificato_il;
      this.stato.set(m.stato); this.statoSalvato.set(m.stato);
      this.cliente.set(m.cliente_id);
      if (m.clienti && !this.clienti().some(c => c.id === m.clienti!.id)) this.clienti.update(l => [...l, m.clienti!]);
      this.doc.set({ data: m.data_movimento, numBolla: m.numero_documento ?? '', dataBolla: m.data_bolla ?? '', colli: m.colli == null ? '' : String(m.colli),
        contenuto: m.contenuto ?? '', peso: m.peso == null ? '' : String(m.peso).replace('.', ','), porto: m.porto ?? 'Franco', corriere: m.spedizioniere ?? '',
        tracking: m.tracking ?? '', causale: m.causale ?? '', annot: m.annotazioni ?? '' });
      this.righe.set(letto.righe.map(r => ({ ...r, qta: r.sped, iva: r.articolo ? (r.articolo.iva === 4 ? '04' : r.articolo.iva === 0 ? '0' : '22') : '22',
        giaScaricati: this.scarico() && ['Definitivo', 'Evaso'].includes(m.stato) ? r.sped : 0 })));
      this.ordineOrigine.set(this.scarico() ? Number(/ordine da cliente #(\d+)/i.exec(m.causale ?? '')?.[1] ?? 0) || null : null);
      if (!this.scarico()) this.scaricoId.set(await this.supabase.rpc('scarico_di_ordine', { p_ordine: m.id }));
      if (this.query.has('ddt')) void this.ddt();
    } catch (e) {
      this.errore.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.caricamento.set(false);
    }
  }

  protected campo(k: keyof DocCliente, e: Event): void { const v = this.testo(e); this.doc.update(d => ({ ...d, [k]: v })); }
  protected applicaSconto(): void {
    const p = Math.min(100, Math.max(0, this.sconto()));
    if (!this.righe().length) { this.avvisi.mostra('Aggiungi prima gli articoli: lo sconto vale anche per quelli che aggiungi dopo'); return; }
    this.righeComp()?.scontoATutte(p);
    this.avvisi.mostra(`Sconto ${p}% messo su tutte le ${this.righe().length} righe`);
  }

  // ---------- Nuovo cliente al volo (salva_cliente: codice automatico) ----------
  protected apriNuovoCliente(): void { this.nuovoCliente.set({ nome: '', indirizzo: '', cap: '', citta: '', provincia: '', telefono: '', piva: '' }); }
  protected campoNuovo(k: CampoNuovo, e: Event): void { const v = this.testo(e); this.nuovoCliente.update(n => (n ? { ...n, [k]: v } : n)); }
  protected async salvaNuovoCliente(): Promise<void> {
    const n = this.nuovoCliente();
    if (!n) return;
    const nome = n.nome.trim().toUpperCase();
    if (!nome) { this.avvisi.mostra('Scrivi il nome del cliente', true); return; }
    const piva = n.piva.trim(), t = (s: string): string | null => s.trim() || null;
    try {
      const id = await this.supabase.rpc('salva_cliente', { p_id: null, p_dati: { nome, indirizzo: t(n.indirizzo.toUpperCase()), cap: t(n.cap), citta: t(n.citta.toUpperCase()),
        provincia: t(n.provincia.toUpperCase()), telefono: t(n.telefono), partita_iva: /^\d{11}$/.test(piva) ? piva : null, codice_fiscale: piva && !/^\d{11}$/.test(piva) ? piva.toUpperCase() : null } });
      const { data } = await this.supabase.client.from('clienti').select('*').eq('id', id).maybeSingle();
      if (data) this.clienti.update(l => [...l, data as Cliente]);
      this.cliente.set(id);
      this.nuovoCliente.set(null);
      this.avvisi.mostra(`Cliente ${(data as Cliente | null)?.codice ?? ''}: ${nome} aggiunto`);
    } catch (e) { this.avvisi.errore(e); }
  }

  // ---------- DDT ----------
  /** Prima del DDT di un ordine salvato: "Vuoi scalare la merce dalla giacenza?" (se non è già stato scalato). */
  protected async ddt(): Promise<void> {
    if (this.nuovo || this.scarico() || this.statoSalvato() === 'Annullato') { this.stampaDdt(); return; }
    this.scaricoId.set(await this.supabase.rpc('scarico_di_ordine', { p_ordine: this.id()! }).catch(() => this.scaricoId()));
    if (this.scaricoId()) { this.stampaDdt(); return; }
    this.chiediScala.set(true);
  }
  protected scalaNo(): void { this.chiediScala.set(false); this.avvisi.mostra('Merce non scalata: la giacenza non cambia'); this.stampaDdt(); }
  protected scalaSi(): void {
    void this.conSalvataggio(async () => {
      const id = await this.mov.scalaOrdineCliente(this.id()!);
      this.scaricoId.set(id);
      this.stato.set('Evaso'); this.statoSalvato.set('Evaso');
      const { data } = await this.supabase.client.from('movimenti').select('modificato_il').eq('id', this.id()!).maybeSingle();
      this.versione = (data as { modificato_il: string } | null)?.modificato_il ?? this.versione;
      this.chiediScala.set(false);
      this.avvisi.mostra(`Merce scalata dalla giacenza (scarico #${id})`);
      setTimeout(() => this.stampaDdt(), 700);
    });
  }
  private stampaDdt(): void {
    const c = this.clienteScelto();
    if (!c) { this.avvisi.mostra('Scegli il cliente: il DDT si intesta a lui', true); this.tab.set('dettagli'); return; }
    const lista = this.righe().filter(r => r.articolo && r.qta > 0);
    if (!lista.length) { this.avvisi.mostra('Non ci sono articoli da mettere nel DDT'); return; }
    const q = (n: number): string => n.toLocaleString('it-IT', { maximumFractionDigits: 2 });
    const d = this.doc();
    salvaDdt({ titolo: this.scarico() ? 'Spedizione a Cliente' : 'Ordine da Cliente', sede: this.nomeSede, numBolla: d.numBolla.trim(), dataBolla: d.dataBolla ? dataIt(d.dataBolla) : '',
      consegna: righeDestinatario(c, c.nome), codiceCliente: c.codice, colli: d.colli, contenuto: d.contenuto.trim(), peso: d.peso.trim().replace('.', ','), porto: d.porto,
      corriere: d.corriere.trim(), tracking: d.tracking.trim(), quantitaTotale: q(lista.reduce((s, r) => s + r.qta, 0)),
      righe: lista.map((r, i) => ({ n: i + 1, cod: r.articolo!.codice, descr: r.articolo!.descrizione, qta: q(r.qta) })), ritorno: this.router.url.replace(/[&?]ddt=1/, '') });
    void this.registro.registra('Stampa DDT', `${this.scarico() ? 'Scarico' : 'Ordine'} #${this.id() ?? 'nuovo'} · bolla ${d.numBolla.trim()} · ${c.nome}`);
    void this.router.navigate(['/stampa-ddt']);
  }

  // ---------- Modifica / salva ----------
  private prima: { stato: string; cliente: string | null; doc: DocCliente; righe: RigaMovimento[] } | null = null;
  protected modificaScheda(): void {
    this.prima = { stato: this.stato(), cliente: this.cliente(), doc: { ...this.doc() }, righe: this.righe().map(r => ({ ...r })) };
    this.entraInModifica();
  }
  protected annullaModifica(): void {
    if (this.nuovo) {
      if (!this.righe().some(r => r.articolo) || confirm("Uscire senza salvare l'ordine?")) { this.esciDaModifica(); void this.router.navigateByUrl(this.elenco()); }
      return;
    }
    if (this.prima) { this.stato.set(this.prima.stato); this.cliente.set(this.prima.cliente); this.doc.set(this.prima.doc); this.righe.set(this.prima.righe); }
    this.esciDaModifica();
  }
  private firma(l: RigaMovimento[]): string { return JSON.stringify(l.filter(r => r.articolo).map(r => [r.articolo!.codice, r.qta, r.prezzo, r.sconto])); }

  protected salva(chiudi: boolean): void {
    void this.conSalvataggio(async () => {
      this.righeComp()?.togliVuote();
      if (!this.cliente()) { this.avvisi.mostra('Scegli il cliente (o aggiungilo con ➕ Nuovo cliente)', true); this.tab.set('dettagli'); return; }
      if (!this.righe().some(r => r.articolo && r.qta > 0)) { this.avvisi.mostra('Aggiungi almeno un articolo nella scheda Articoli', true); this.tab.set('articoli'); return; }
      if (this.righeBloccate() && this.prima && this.firma(this.righe()) !== this.firma(this.prima.righe)) {
        this.avvisi.mostra(`La merce di questo ordine è già scalata (scarico #${this.scaricoId()}): gli articoli non si cambiano qui. Per mandare meno pezzi apri lo scarico.`, true);
        this.righe.set(this.prima.righe.map(r => ({ ...r })));
        return;
      }
      const oltre = this.scarico() && ['Definitivo', 'Evaso'].includes(this.stato()) ? this.righeComp()?.oltreGiacenzaTesto() : '';
      if (oltre) { this.avvisi.mostra(oltre, true); this.tab.set('articoli'); return; }
      const d = this.doc(), t = (s: string): string | null => s.trim() || null;
      const dati: MovimentoDaSalvare = {
        tipo: this.scarico() ? 'scarico_cliente' : 'ordine_cliente', stato: this.stato() as MovimentoDaSalvare['stato'], sede_id: this.sedeId, cliente_id: this.cliente(), fornitore_id: null,
        data_movimento: d.data || this.oggi, data_documento: d.data || this.oggi, numero_documento: t(d.numBolla), data_bolla: d.dataBolla || d.data || this.oggi,
        colli: d.colli === '' ? null : Number(d.colli), contenuto: t(d.contenuto), peso: d.peso.trim() ? cent(Number(d.peso.replace(',', '.'))) || null : null,
        porto: d.porto, spedizioniere: t(d.corriere), tracking: t(d.tracking), causale: t(d.causale), annotazioni: t(d.annot), spese: 0
      };
      let id = this.id();
      if (this.righeBloccate()) {
        // ordine già scalato: si salvano solo i dati del documento, le righe restano quelle collegate allo scarico
        const { tipo: _t, stato: _s, sede_id: _sd, cliente_id: _c, fornitore_id: _f, ...documento } = dati;
        await this.mov.aggiornaDocumento(id!, documento);
      } else {
        const righe = this.righe().filter(r => r.articolo && r.qta > 0).map(r => ({ articolo_id: r.articolo!.id, quantita: r.qta, prezzo: r.prezzo, sconto: r.sconto || 0, etichette: 0, ordine_riga_id: r.ordineRigaId }));
        id = await this.mov.salva(this.id(), dati, righe, this.versione);
      }
      this.avvisi.mostra(`${this.scarico() ? 'Scarico' : 'Ordine'} salvato${d.numBolla.trim() ? ' · bolla ' + d.numBolla.trim() : ': numero di bolla assegnato'}`);
      this.dopoSalvataggio('/ordine-cliente', id!, chiudi, this.elenco());
    });
  }

  protected excel(): void {
    const lista = this.righe().filter(r => r.articolo && r.qta > 0);
    if (!lista.length) { this.avvisi.mostra('Non ci sono articoli da mettere nel file Excel'); return; }
    const c = this.clienteScelto();
    excelMovimento({ sede: this.nomeSede, tipo: this.nome(), numero: this.id(), ivaInclusa: true,
      riepilogo: [['Data Documento', dataIt(this.doc().data)], ['Numero Bolla', this.doc().numBolla], ['Cliente', c?.nome ?? ''], ['Cliente - Codice', c?.codice ?? '']],
      righe: lista.map(r => ({ codice: r.articolo!.codice, descr: r.articolo!.descrizione, anno: r.articolo!.anno, prezzo: r.prezzo, sconto: r.sconto, qta: r.qta, unita: r.articolo!.unita, iva: percIvaRiga(r.iva) })) });
  }
  protected toNumber = toNumber;
}
