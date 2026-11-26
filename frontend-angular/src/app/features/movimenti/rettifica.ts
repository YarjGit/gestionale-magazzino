import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { MovimentoDaSalvare } from '../../core/models/database.types';
import { cent, dataIt, numero } from '../../shared/formato';
import { salvaPerStampa } from '../../shared/intestazioni';
import { excelMovimento } from '../../shared/excel';
import { percIvaRiga, RigheMovimentoComponent, type ConfigRighe, type RigaMovimento } from '../../shared/righe-movimento';
import { SchedaBase, TestaScheda } from '../../shared/scheda-movimento';
import { MovimentiService } from './movimenti.service';

type Motivo = { k: string; ico: string; t: string; s: string; es: string };
const MOTIVI_AUMENTO: Motivo[] = [
  { k: 'Inventario', ico: '🔍', t: 'Inventario', s: 'merce ritrovata contando il magazzino', es: "es. trovati nello scaffale B durante l'inventario" },
  { k: 'Da altri centri', ico: '🏢', t: 'Da altri centri o sedi chiuse', s: 'merce che arriva senza trasferimento', es: 'es. merce della sede di … chiusa' },
  { k: 'Donazione', ico: '🎁', t: 'Donazione', s: 'merce regalata', es: 'es. donati dalla parrocchia di …' },
  { k: 'Altro', ico: '✏️', t: 'Altro', s: 'scrivi il perché nella causale', es: 'scrivi il motivo' }
];
const MOTIVI_DIMINUZIONE: Motivo[] = [
  { k: 'Rotto', ico: '💔', t: 'Rotto o rovinato', s: 'non più vendibile', es: "es. calice caduto durante l'allestimento" },
  { k: 'Inventario', ico: '🔍', t: "Mancante all'inventario", s: 'contando ne risultano meno', es: 'es. inventario di novembre, scaffale B' },
  { k: 'Smarrito', ico: '❔', t: 'Smarrito o rubato', s: 'non si trova più', es: 'es. sparito dal banco espositivo' },
  { k: 'Uso interno', ico: '🏠', t: 'Uso interno o omaggio', s: 'preso per la comunità o regalato', es: 'es. dato in omaggio alla parrocchia di …' },
  { k: 'Altro', ico: '✏️', t: 'Altro', s: 'scrivi il perché nella causale', es: 'scrivi il motivo' }
];

/**
 * Aumento giacenza (prototipo/aumento.html) e Diminuzione giacenza (prototipo/diminuzione.html), stessa scheda:
 *  - aumento: merce che entra senza fornitore; motivo a riquadri, ANNO DI ACQUISTO scelto a mano (anche passato: si stampa
 *    sulle etichette), costo della scheda articolo, quantità in "Arrivata", etichette.
 *  - diminuzione: merce che esce senza vendita né trasferimento; niente anno (esce dal lotto più vecchio), niente etichette,
 *    non più pezzi di quelli in giacenza.
 */
@Component({
  selector: 'app-rettifica',
  imports: [TestaScheda, RigheMovimentoComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rettifica.html',
  styles: `
    .motivi { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
    .motivo { display: flex; flex-direction: column; gap: 3px; padding: 11px 13px; border: 2px solid var(--line); border-radius: 11px; background: #fff; text-align: left; cursor: pointer; font: inherit; color: var(--text); }
    .motivo b { font-size: 0.92rem; } .motivo small { color: var(--muted); font-size: 0.78rem; line-height: 1.3; } .motivo .ico { font-size: 1.25rem; }
    .motivo:hover:not(:disabled) { border-color: #9cc3f5; }
    .motivo.scelto { border-color: #18a058; background: #effaf3; } .motivo.scelto b { color: #13804a; }
    .motivo:disabled { cursor: default; } .motivo:disabled:not(.scelto) { opacity: 0.45; }
    .anno-box { display: flex; align-items: center; gap: 10px; }
    .anno-box select { width: 110px; font-weight: 700; text-align: right; }
    .anno-box .vecchio { padding: 3px 9px; border-radius: 6px; background: #fff4d6; color: #9a6a00; font-size: 0.78rem; font-weight: 600; }
  `
})
export class Rettifica extends SchedaBase {
  private readonly mov = inject(MovimentiService);
  private readonly righeComp = viewChild(RigheMovimentoComponent);
  protected readonly numero = numero;

  protected readonly aumento = this.route.snapshot.data['tipo'] === 'aumento';
  protected readonly tipo = this.aumento ? 'aumento_giacenza' : 'diminuzione_giacenza';
  protected readonly MOTIVI = this.aumento ? MOTIVI_AUMENTO : MOTIVI_DIMINUZIONE;
  protected readonly nome = this.aumento ? 'aumento' : 'diminuzione';
  protected readonly elenco = this.aumento ? '/movimenti/aumento-giacenza' : '/movimenti/diminuzione-giacenza';
  protected readonly pagina = this.aumento ? '/aumento' : '/diminuzione';
  protected readonly annoOggi = new Date().getFullYear();

  protected readonly stato = signal('Definitivo');
  protected readonly statoSalvato = signal('Definitivo');
  protected readonly data = signal(this.oggi);
  protected readonly anno = signal(this.annoOggi);
  protected readonly motivo = signal(this.aumento ? 'Inventario' : '');
  protected readonly causale = signal('');
  protected readonly annot = signal('');
  protected readonly righe = signal<RigaMovimento[]>([]);
  protected readonly inventario = signal<number | null>(null);
  protected readonly anni = computed(() => { const l = Array.from({ length: 12 }, (_, i) => this.annoOggi - i); if (!l.includes(this.anno())) l.push(this.anno()); return l; });
  protected readonly esempio = computed(() => (this.MOTIVI.find(m => m.k === this.motivo()) ?? this.MOTIVI[0]).es);
  protected readonly config: ConfigRighe = this.aumento
    ? { etichettaPrezzo: 'Costo', prezzoDi: a => a.costo, spedita: true, soloSpedita: true, nelMovimento: "nell'aumento", senzaOrdinata: true, senzaSconto: true, costoFisso: true, perPezzo: true }
    : { etichettaPrezzo: 'Costo', prezzoDi: a => a.costo, spedita: true, soloSpedita: true, nelMovimento: 'nella diminuzione', limiteGiacenza: true, verboUscita: 'togliere',
        senzaOrdinata: true, senzaSconto: true, costoFisso: true, senzaAnno: true, perPezzo: true };
  protected readonly totale = computed(() => cent(this.righe().reduce((s, r) => s + (r.articolo ? cent(r.sped * r.prezzo * (1 + percIvaRiga(r.iva) / 100)) : 0), 0)));
  protected readonly pezzi = computed(() => this.righe().reduce((s, r) => s + (r.articolo ? r.sped : 0), 0));

  constructor() {
    super();
    void this.avvia();
  }

  private async avvia(): Promise<void> {
    try {
      if (!this.aumento) this.mov.inventarioInCorso(this.sedeId).then(i => this.inventario.set(i?.id ?? null), () => undefined);
      if (this.nuovo) { this.tab.set('dettagli'); return; }
      const letto = await this.mov.leggi(this.id()!, this.sedeId);
      if (!letto || letto.mov.tipo !== this.tipo) { this.errore.set(`${this.aumento ? 'Aumento' : 'Diminuzione'} #${this.id()} non trovat${this.aumento ? 'o' : 'a'}`); return; }
      const m = letto.mov;
      this.versione = m.modificato_il;
      this.stato.set(m.stato); this.statoSalvato.set(m.stato);
      this.data.set(m.data_movimento); this.anno.set(m.anno_acquisto ?? Number(m.data_movimento.slice(0, 4)));
      this.motivo.set(m.motivo ?? ''); this.causale.set(m.causale ?? ''); this.annot.set(m.annotazioni ?? '');
      this.righe.set(letto.righe.map(r => ({ ...r, qta: r.sped, iva: r.articolo ? (r.articolo.iva === 4 ? '04' : r.articolo.iva === 0 ? '0' : '22') : '22',
        giaScaricati: !this.aumento && m.stato === 'Definitivo' ? r.sped : 0 })));
    } catch (e) {
      this.errore.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.caricamento.set(false);
    }
  }

  protected scegliMotivo(k: string): void { this.motivo.set(k); }

  private prima: { stato: string; data: string; anno: number; motivo: string; causale: string; annot: string; righe: RigaMovimento[] } | null = null;
  protected modificaScheda(): void {
    this.prima = { stato: this.stato(), data: this.data(), anno: this.anno(), motivo: this.motivo(), causale: this.causale(), annot: this.annot(), righe: this.righe().map(r => ({ ...r })) };
    this.entraInModifica();
  }
  protected annullaModifica(): void {
    if (this.nuovo) {
      if (!this.righe().some(r => r.articolo) || confirm(`Uscire senza salvare ${this.aumento ? "l'aumento" : 'la diminuzione'}?`)) { this.esciDaModifica(); void this.router.navigateByUrl(this.elenco); }
      return;
    }
    const p = this.prima;
    if (p) { this.stato.set(p.stato); this.data.set(p.data); this.anno.set(p.anno); this.motivo.set(p.motivo); this.causale.set(p.causale); this.annot.set(p.annot); this.righe.set(p.righe); }
    this.esciDaModifica();
  }

  protected salva(chiudi: boolean): void {
    void this.conSalvataggio(async () => {
      this.righeComp()?.togliVuote();
      if (!this.motivo()) { this.avvisi.mostra(this.aumento ? 'Scegli perché entra la merce (Inventario, Da altri centri, Donazione, Altro)' : 'Scegli perché esce la merce (Rotto, Mancante all\'inventario, Smarrito, Uso interno, Altro)', true); this.tab.set('dettagli'); return; }
      if (this.motivo() === 'Altro' && !this.causale().trim()) { this.avvisi.mostra('Con "Altro" scrivi il motivo nella causale', true); this.tab.set('dettagli'); return; }
      const oltre = this.righeComp()?.oltreGiacenzaTesto();
      if (oltre) { this.avvisi.mostra(oltre + ': correggi la quantità', true); this.tab.set('articoli'); return; }
      if (!this.righe().some(r => r.articolo && r.sped > 0)) { this.avvisi.mostra('Aggiungi almeno un articolo nella scheda Articoli', true); this.tab.set('articoli'); return; }
      const m: MovimentoDaSalvare = {
        tipo: this.tipo, stato: this.stato() as MovimentoDaSalvare['stato'], sede_id: this.sedeId, data_movimento: this.data() || this.oggi, motivo: this.motivo(),
        causale: this.causale().trim() || null, annotazioni: this.annot().trim() || null, spese: 0, ...(this.aumento ? { anno_acquisto: this.anno() } : {})
      };
      const righe = this.mov.daSalvare(this.righe(), { spedita: true }).map(r => ({ ...r, sconto: 0, etichette: this.aumento ? r.quantita : 0 }));
      const nuovoId = await this.mov.salva(this.id(), m, righe, this.versione);
      this.avvisi.mostra(m.stato === 'Definitivo'
        ? (this.aumento ? `Aumento salvato: ${this.pezzi()} pezzi entrati nella giacenza di ${this.nomeSede}, anno ${this.anno()}` : `Diminuzione salvata: ${this.pezzi()} pezzi tolti dalla giacenza di ${this.nomeSede}`)
        : `Salvato come provvisorio: la giacenza non cambia finché non è definitivo`);
      this.dopoSalvataggio(this.pagina, nuovoId, chiudi, this.elenco);
    });
  }

  /** Etichette (solo aumento): anno di acquisto scelto, costo cifrato e prezzo; un'etichetta per pezzo. */
  protected etichette(): void {
    const righe = this.righe().filter(r => r.articolo && r.sped > 0).map(r => ({
      art: { codice: r.articolo!.codice, descr: r.articolo!.descrizione, barcode: r.articolo!.barcode ?? '', costo: r.prezzo, prezzo: r.articolo!.prezzo }, n: r.sped, anno: this.anno()
    }));
    if (!righe.length) { this.avvisi.mostra('Non ci sono articoli per le etichette'); return; }
    salvaPerStampa('etichette', { titolo: this.id() ? `Aumento giacenza #${this.id()}` : 'Nuovo aumento', ritorno: this.router.url, righe });
    void this.router.navigate(['/etichette'], { queryParams: { da: 'sessione' } });
  }

  protected excel(): void {
    const lista = this.righe().filter(r => r.articolo && r.sped > 0);
    if (!lista.length) { this.avvisi.mostra('Non ci sono articoli da mettere nel file Excel'); return; }
    excelMovimento({ sede: this.nomeSede, tipo: this.aumento ? 'Aumento Giacenza' : 'Diminuzione Giacenza', numero: this.id(),
      riepilogo: [['Data Documento', dataIt(this.data())], ['Motivo', this.motivo()], ...(this.aumento ? [['Anno di acquisto', String(this.anno())] as [string, string]] : []), ['Causale', this.causale()]],
      righe: lista.map(r => ({ codice: r.articolo!.codice, descr: r.articolo!.descrizione, anno: this.aumento ? this.anno() : r.articolo!.anno, prezzo: r.prezzo, sconto: 0, qta: r.sped, unita: r.articolo!.unita, iva: percIvaRiga(r.iva) })) });
  }
}
