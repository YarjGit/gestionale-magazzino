import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { MovimentoDaSalvare, RigaDaSalvare } from '../../core/models/database.types';
import { toNumber } from '../../core/models/database.types';
import { ErroreDatabase, SupabaseService } from '../../core/services/supabase.service';
import { excelMovimento } from '../../shared/excel';
import { cent, dataIt, numero, SEDI_ESTERE } from '../../shared/formato';
import { percIvaRiga, RigheMovimentoComponent, type ConfigRighe, type RigaMovimento } from '../../shared/righe-movimento';
import { SchedaBase, TestaScheda } from '../../shared/scheda-movimento';
import { MovimentiService } from './movimenti.service';

type Doppione = { id: number; stato: string; causale: string | null };
const giornoIt = (d: string): string => d.split('-').reverse().join('/');

/**
 * Vendita giornaliera (prototipo/vendita.html): lo scarico del venduto di un giorno, prezzi IVA inclusa, quantità solo in Spedita,
 * mai più della giacenza. ?canale=ecommerce = giornata e-commerce (causale "E-COMMERCE – …", ogni vendita una riga con l'ora).
 * Una giornata per giorno: se c'è già, "vuoi riaprire quella?" (Sì = si riapre, No = un'altra con nota obbligatoria); su una
 * giornata vecchia si chiede prima di aggiungere; spostarla di giorno chiede conferma e mai in un altro anno.
 * Se un altro computer ha salvato prima (CONFLITTO / GIORNATA_ESISTE) i miei articoli si aggiungono alla sua giornata.
 */
@Component({
  selector: 'app-vendita',
  imports: [TestaScheda, RigheMovimentoComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vendita.html'
})
export class Vendita extends SchedaBase {
  private readonly mov = inject(MovimentiService);
  private readonly supabase = inject(SupabaseService);
  private readonly righeComp = viewChild(RigheMovimentoComponent);
  protected readonly numero = numero;
  protected readonly giornoIt = giornoIt;

  protected readonly ecom = signal(this.query.get('canale') === 'ecommerce');
  protected readonly stato = signal('Definitivo');
  protected readonly statoSalvato = signal('Definitivo');
  protected readonly giorno = signal(this.oggi);
  protected readonly giornoSalvato = signal<string | null>(null);
  protected readonly causale = signal('');
  protected readonly annot = signal('');
  protected readonly spese = signal(0);
  protected readonly righe = signal<RigaMovimento[]>([]);
  protected readonly inventario = signal<number | null>(null);
  protected readonly giornataOggi = signal<number | null>(null);
  protected readonly doppione = signal<{ g: Doppione; giorno: string; unire: boolean; nota: boolean; fine: (v: 'unisci' | 'riapri' | 'nuova' | 'annulla') => void } | null>(null);
  protected readonly notaDoppia = signal('');
  private notaDistinta = '';
  protected readonly okGiornoVecchio = signal(false);
  /** quantità salvate di ogni riga (per capire cosa è stato aggiunto in questa pagina) */
  private qtaDb = new Map<number, number>();

  protected readonly estera = computed(() => SEDI_ESTERE.includes(this.nomeSede));
  protected readonly elenco = computed(() => (this.ecom() ? '/movimenti/vendite-giornaliere?canale=ecommerce' : '/movimenti/vendite-giornaliere'));
  protected readonly config = computed<ConfigRighe>(() => ({
    etichettaPrezzo: 'Prezzo', ivaInclusa: true, spedita: true, soloSpedita: true, nelMovimento: 'nella giornata', limiteGiacenza: true, righeSeparate: this.ecom(),
    // sede estera: si vende senza IVA, il prezzo è quello in etichetta tolta l'IVA
    prezzoDi: a => (this.estera() ? cent(a.prezzo / (1 + a.iva / 100)) : a.prezzo),
    testoVuoto: this.ecom() ? 'Spara o scrivi i codici degli articoli venduti online in questo giorno.' : 'Spara i barcode degli articoli venduti con la pistola, oppure usa il tasto ＋ e scrivi il codice.'
  }));
  protected readonly totale = computed(() => cent(this.righe().reduce((s, r) => s + (r.articolo ? cent(r.sped * r.prezzo * (1 - r.sconto / 100)) : 0), 0)));
  protected readonly pezzi = computed(() => this.righe().reduce((s, r) => s + (r.articolo ? r.sped : 0), 0));
  protected readonly vecchia = computed(() => !this.nuovo && !!this.giornoSalvato() && this.giornoSalvato() !== this.oggi);

  constructor() {
    super();
    void this.avvia();
  }

  private causaleDi(g: string): string { return this.ecom() ? `E-COMMERCE – vendite online del ${giornoIt(g)}` : `Riepilogo vendite giornaliere del ${giornoIt(g)}`; }

  private async avvia(): Promise<void> {
    try {
      this.mov.inventarioInCorso(this.sedeId).then(i => this.inventario.set(i?.id ?? null), () => undefined);
      if (this.nuovo) {
        this.causale.set(this.causaleDi(this.oggi));
        this.tab.set('articoli');
        const g = await this.giornataDelGiorno(this.oggi);
        if (g) {
          this.giornataOggi.set(g.id);
          const r = await this.chiediDoppione(g, this.oggi, false);
          if (r === 'annulla') { this.esciDaModifica(); void this.router.navigateByUrl(this.elenco()); return; }
        }
        setTimeout(() => this.righeComp()?.nuovaRiga());
        return;
      }
      const letto = await this.mov.leggi(this.id()!, this.sedeId);
      if (!letto || letto.mov.tipo !== 'vendite_giornaliere') { this.errore.set(`Giornata #${this.id()} non trovata`); return; }
      const m = letto.mov;
      this.versione = m.modificato_il;
      this.ecom.set(/^E-?COMMERCE/i.test(m.causale ?? ''));
      this.stato.set(m.stato); this.statoSalvato.set(m.stato);
      this.giorno.set(m.data_movimento); this.giornoSalvato.set(m.data_movimento);
      this.causale.set(m.causale ?? ''); this.annot.set(m.annotazioni ?? ''); this.spese.set(toNumber(m.spese));
      // giornata definitiva: i suoi pezzi sono già usciti dalla giacenza (si restituiscono nel controllo in modifica)
      this.righe.set(letto.righe.map(r => ({ ...r, qta: r.sped, iva: r.articolo ? (r.articolo.iva === 4 ? '04' : r.articolo.iva === 0 ? '0' : '22') : '22',
        giaScaricati: m.stato === 'Definitivo' ? r.sped : 0 })));
      this.qtaDb = new Map(letto.righe.map(r => [r.pos, r.sped]));
      if (m.data_movimento !== this.oggi) this.giornataDelGiorno(this.oggi).then(g => this.giornataOggi.set(g?.id ?? null), () => undefined);
      // "Aggiungi alle vendite di oggi" (?modifica=1): già in modifica, pronta per la pistola
      if (m.stato !== 'Annullato' && this.query.has('modifica')) {
        this.modificaGiornata();
        this.tab.set('articoli');
        setTimeout(() => this.righeComp()?.nuovaRiga());
      }
    } catch (e) {
      this.errore.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.caricamento.set(false);
    }
  }

  /** Giornata (dello stesso canale) già salvata per quel giorno e non annullata, esclusa quella aperta. */
  private async giornataDelGiorno(giorno: string): Promise<Doppione | null> {
    const { data, error } = await this.supabase.client.from('movimenti').select('id, stato, causale')
      .eq('tipo', 'vendite_giornaliere').eq('sede_id', this.sedeId).eq('data_movimento', giorno);
    if (error) throw new ErroreDatabase(error);
    return ((data ?? []) as Doppione[]).find(m => m.stato !== 'Annullato' && m.id !== this.id() && /^E-?COMMERCE/i.test(m.causale ?? '') === this.ecom()) ?? null;
  }

  private haNotaDistinta(): boolean {
    return !!this.notaDistinta || (!this.nuovo && !!this.giornoSalvato() && !!this.causale().trim() && this.causale().trim() !== this.causaleDi(this.giornoSalvato()!));
  }

  /** "Vendite di oggi già create, vuoi riaprire quelle di oggi?" */
  private chiediDoppione(g: Doppione, giorno: string, salvando: boolean): Promise<'unisci' | 'riapri' | 'nuova' | 'annulla'> {
    this.notaDoppia.set('');
    return new Promise(fine => this.doppione.set({ g, giorno, unire: salvando && this.righe().some(r => r.articolo), nota: false, fine }));
  }
  protected doppioneSi(): void {
    const d = this.doppione();
    if (!d) return;
    this.doppione.set(null);
    if (d.unire) { d.fine('unisci'); return; }
    this.esciDaModifica();
    d.fine('riapri');
    void this.router.navigateByUrl('/caricamento', { skipLocationChange: true }).then(() => this.router.navigate(['/vendita', d.g.id], { queryParams: { modifica: 1 } }));
  }
  protected doppioneNo(): void {
    const d = this.doppione();
    if (!d) return;
    if (d.nota) { this.doppione.set(null); d.fine('annulla'); return; }
    this.doppione.set({ ...d, nota: true });
  }
  protected doppioneCrea(): void {
    const d = this.doppione(), nota = this.notaDoppia().trim();
    if (!d) return;
    if (!nota) { this.avvisi.mostra("Scrivi una nota per distinguerla dall'altra giornata", true); return; }
    this.notaDistinta = nota;
    // la nota va nella causale (si vede nell'elenco) e nelle annotazioni
    this.causale.set(`${this.causaleDi(this.giorno() || this.oggi)} – ${nota}`);
    this.annot.set([nota, this.annot().trim()].filter(Boolean).join('\n'));
    this.avvisi.mostra('Nuova giornata separata: ' + nota);
    this.doppione.set(null);
    d.fine('nuova');
  }

  /** Spostare una giornata salvata sposta tutte le sue vendite: si chiede, e mai in un altro anno. */
  protected cambiaGiorno(e: Event): void {
    const el = e.target as HTMLInputElement, nuovoG = el.value, salvato = this.giornoSalvato();
    if (salvato && nuovoG && nuovoG !== salvato) {
      if (nuovoG.slice(0, 4) !== salvato.slice(0, 4)) {
        this.avvisi.mostra(`La giornata è del ${salvato.slice(0, 4)}: non si può spostare in un altro anno (cambierebbe la giacenza di inizio anno). Fai una giornata nuova.`, true);
        el.value = this.giorno(); return;
      }
      if (!confirm(`Spostare tutta la giornata dal ${giornoIt(salvato)} al ${giornoIt(nuovoG)}? Tutte le sue vendite cambieranno giorno.\nSe vuoi solo registrare le vendite di un altro giorno, fai una giornata nuova.`)) { el.value = this.giorno(); return; }
    }
    // la causale segue il giorno finché non viene scritta a mano
    if (/^(Riepilogo vendite giornaliere del |E-COMMERCE – vendite online del )/.test(this.causale())) this.causale.set(this.causaleDi(nuovoG));
    this.giorno.set(nuovoG);
  }

  /** Giornata di un giorno passato: prima di aggiungere si chiede (una volta) se è stato venduto quel giorno. */
  protected puoAggiungere(): boolean {
    if (this.nuovo || this.giorno() === this.oggi || this.okGiornoVecchio()) return true;
    this.okGiornoVecchio.set(confirm(`Questa giornata è del ${giornoIt(this.giorno())}.\nL'articolo è stato venduto quel giorno?\n\nOK = sì, aggiungilo qui · Annulla = no (le vendite di oggi vanno nella giornata di oggi)`));
    return this.okGiornoVecchio();
  }
  protected nuovaRigaControllata(): void { if (this.puoAggiungere()) this.righeComp()?.nuovaRiga(); }

  private prima: { stato: string; giorno: string; causale: string; annot: string; righe: RigaMovimento[] } | null = null;
  protected modificaGiornata(): void {
    this.prima = { stato: this.stato(), giorno: this.giorno(), causale: this.causale(), annot: this.annot(), righe: this.righe().map(r => ({ ...r })) };
    this.entraInModifica();
  }
  protected annullaModifica(): void {
    if (this.nuovo) {
      if (!this.righe().some(r => r.articolo) || confirm('Uscire senza salvare la giornata?')) { this.esciDaModifica(); void this.router.navigateByUrl(this.elenco()); }
      return;
    }
    if (this.prima) { this.stato.set(this.prima.stato); this.giorno.set(this.prima.giorno); this.causale.set(this.prima.causale); this.annot.set(this.prima.annot); this.righe.set(this.prima.righe); }
    this.esciDaModifica();
  }

  private righeDaSalvare(): RigaDaSalvare[] {
    return this.righe().filter(r => r.articolo && r.sped > 0).map(r => ({ articolo_id: r.articolo!.id, quantita: r.sped, prezzo: r.prezzo, sconto: r.sconto || 0, aggiunto_il: r.ora }));
  }

  protected salva(chiudi: boolean): void {
    void this.conSalvataggio(async () => {
      this.righeComp()?.togliVuote();
      if (!this.righe().length) { this.avvisi.mostra('Aggiungi almeno un articolo venduto', true); return; }
      const oltre = this.righeComp()?.oltreGiacenzaTesto();
      if (oltre) { this.avvisi.mostra(oltre + ': correggi la quantità prima di salvare', true); this.tab.set('articoli'); return; }
      const giorno = this.giorno() || this.oggi;
      // una giornata per giorno: se c'è già, si aggiungono lì i miei articoli, oppure se ne fa un'altra con la nota
      const doppia = await this.giornataDelGiorno(giorno);
      let doppiaOk = false;
      if (doppia && !this.haNotaDistinta()) {
        const scelta = await this.chiediDoppione(doppia, giorno, true);
        if (scelta === 'unisci') { await this.unisciAllaGiornata(doppia.id, chiudi, 'GIORNATA_ESISTE'); return; }
        if (scelta !== 'nuova') return;
        doppiaOk = true;
      }
      const m: MovimentoDaSalvare = {
        tipo: 'vendite_giornaliere', stato: this.stato() as MovimentoDaSalvare['stato'], sede_id: this.sedeId, data_movimento: giorno,
        causale: this.causale().trim() || null, annotazioni: this.annot().trim() || null, spese: this.spese(), ...(doppiaOk ? { _doppia_ok: true } : {})
      };
      try {
        const nuovoId = await this.mov.salva(this.id(), m, this.righeDaSalvare(), this.versione);
        this.avvisi.mostra(m.stato === 'Definitivo' ? `Giornata salvata: ${this.pezzi()} pezzi scaricati dalla giacenza di ${this.nomeSede}` : 'Giornata salvata come provvisoria: la giacenza non cambia finché non è definitiva');
        this.dopoSalvataggio('/vendita', nuovoId, chiudi, this.elenco());
      } catch (e) {
        // due computer sulla stessa giornata o due giornate di oggi create insieme: i miei articoli vanno in quella dell'altro
        const t = e instanceof ErroreDatabase ? e.originale : e instanceof Error ? e.message : '';
        const altra = /GIORNATA_ESISTE\|(\d+)/.exec(t);
        if (altra) { await this.unisciAllaGiornata(Number(altra[1]), chiudi, 'GIORNATA_ESISTE'); return; }
        if (/CONFLITTO/.test(t) && this.id()) { await this.unisciAllaGiornata(this.id()!, chiudi, 'CONFLITTO'); return; }
        throw e;
      }
    });
  }

  /** Rilegge la giornata com'è ora nel database, ci aggiunge gli articoli inseriti in questa pagina e la salva. */
  private async unisciAllaGiornata(idGiornata: number, chiudi: boolean, motivo: 'CONFLITTO' | 'GIORNATA_ESISTE'): Promise<void> {
    const altra = await this.mov.leggi(idGiornata, this.sedeId);
    if (!altra) throw new Error(`Giornata #${idGiornata} non trovata`);
    const nuove = this.righe().filter(r => r.articolo && r.sped > (this.qtaDb.get(r.pos) ?? 0))
      .map(r => ({ articolo_id: r.articolo!.id, quantita: r.sped - (this.qtaDb.get(r.pos) ?? 0), prezzo: r.prezzo, sconto: r.sconto || 0, aggiunto_il: r.ora }));
    const tutte: RigaDaSalvare[] = altra.righe.filter(r => r.articolo).map(r => ({ articolo_id: r.articolo!.id, quantita: r.sped, prezzo: r.prezzo, sconto: r.sconto, aggiunto_il: r.ora })).concat(nuove);
    const a = altra.mov;
    const id = await this.mov.salva(a.id, { tipo: a.tipo, stato: a.stato, sede_id: a.sede_id, data_movimento: a.data_movimento, causale: a.causale, annotazioni: a.annotazioni, spese: toNumber(a.spese) }, tutte, a.modificato_il);
    this.avvisi.mostra(`${motivo === 'CONFLITTO' ? 'Anche un altro computer stava lavorando su questa giornata' : 'Un altro computer aveva appena creato la giornata'}: ho aggiunto i tuoi ${nuove.length} articoli alla giornata #${id}.`);
    this.dopoSalvataggio('/vendita', id, chiudi, this.elenco());
  }

  protected excel(): void {
    const lista = this.righe().filter(r => r.articolo && r.sped > 0);
    if (!lista.length) { this.avvisi.mostra('Non ci sono articoli da mettere nel file Excel'); return; }
    excelMovimento({ sede: this.nomeSede, tipo: this.ecom() ? 'Vendite E-commerce' : 'Vendite Giornaliere', numero: this.id(), ivaInclusa: true,
      riepilogo: [['Giorno', dataIt(this.giorno())]], spese: [],
      righe: lista.map(r => ({ codice: r.articolo!.codice, descr: r.articolo!.descrizione, anno: r.articolo!.anno, prezzo: r.prezzo, sconto: r.sconto, qta: r.sped, unita: r.articolo!.unita, iva: percIvaRiga(r.iva) })) });
  }
}
