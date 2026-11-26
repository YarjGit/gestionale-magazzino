import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Location, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { Fornitore, InevasoDettaglio, MovimentoDaSalvare, SedeId } from '../../core/models/database.types';
import { toNumber } from '../../core/models/database.types';
import { SupabaseService } from '../../core/services/supabase.service';
import { excelMovimento } from '../../shared/excel';
import { cent, dataIt, euro, leggiNumero, numero, SEDI_ESTERE } from '../../shared/formato';
import { destinatarioSede, ENTE, haIntestazione, salvaPerStampa } from '../../shared/intestazioni';
import { articoloDaRicerca, type ArticoloRiga } from '../../shared/righe-movimento';
import { SchedaBase, TestaScheda } from '../../shared/scheda-movimento';
import { MovimentiService } from './movimenti.service';

type Sezione = 'A' | 'nuovo' | 'vecchio';
interface RigaTrasf {
  pos: number;
  articolo: ArticoloRiga;
  /** quanto manca dell'ordine (null = riga a mano) */
  ordinata: number | null;
  manda: number;
  prezzo: number;
  ordineRigaId: number | null;
  ordineId: number | null;
  dataOrdine: string | null;
  sez: Sezione;
  scelto: boolean;
}

const daInevaso = (r: InevasoDettaglio): ArticoloRiga => ({
  id: r.articolo_id, codice: r.codice, descrizione: r.descrizione, barcode: r.barcode, fornitore_id: null, costo: cent(toNumber(r.costo_netto)),
  prezzo: cent(toNumber(r.prezzo_vendita_ivato)), iva: toNumber(r.iva), anno: r.anno_listino, unita: r.unita_misura, giacenza: toNumber(r.giacenza), giacenzaAltra: null, altroFornitore: false
});

/**
 * Trasferimento a filiale (prototipo/trasferimento.html).
 *  /trasferimento/nuovo?ordine=12  si prepara l'ordine di una filiale: sopra gli articoli disponibili, sotto, separati, i nuovi inevasi
 *                                  dell'ordine e quelli accumulati dagli ordini precedenti (si spuntano per mandarli); quello che non
 *                                  si manda resta negli INEVASI. Salvando Definitivo l'ordine diventa Evaso nella stessa transazione.
 *  /trasferimento/nuovo?righe=5,9  inevasi scelti nella pagina Inevasi
 *  /trasferimento/nuovo            a mano (anche con la pistola)
 *  /trasferimento/20               salvato, in sola lettura: chi l'ha mandato lo può annullare finché non è ricevuto; chi riceve
 *                                  stampa le etichette e preme "Conferma ricevuto" (solo allora la merce entra nella sua giacenza).
 * Prezzo tra filiali = costo d'acquisto. Non si manda più della giacenza (blocco, non solo conferma).
 */
@Component({
  selector: 'app-trasferimento',
  imports: [TestaScheda, RouterLink, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './trasferimento.html',
  styles: `
    tr.sez td { background: #f6f8fb; font-weight: 700; padding-top: 12px; }
    tr.sez td .n { margin-left: 8px; padding: 0 7px; border-radius: 99px; background: #e8f1ff; font-size: .75rem; }
    tr.sez td small { margin-left: 10px; color: var(--muted); font-weight: 500; }
    tr.sez-nuovo td { background: #fff7e8; } tr.sez-vecchio td { background: #f4f0ff; }
    tr.sez-vuota td { color: var(--muted); font-style: italic; }
    tr.manca td { background: #fff9f2; }
    tr.non-scelto td { opacity: .55; }
    .tag-inev { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 5px; font-size: .68rem; font-weight: 700; }
    .tag-inev.nuovo { background: #fff0d6; color: #b26a00; } .tag-inev.vecchio { background: #ede7ff; color: #5b34c9; }
    .inevaso { color: var(--ko); font-weight: 700; } .ok-tutto { color: var(--ok); font-weight: 700; }
    .riepilogo-tr { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 10px; font-size: .88rem; color: var(--muted); }
    .riepilogo-tr b { color: var(--text); }
  `
})
export class Trasferimento extends SchedaBase {
  private readonly mov = inject(MovimentiService);
  private readonly supabase = inject(SupabaseService);
  private readonly location = inject(Location);
  protected readonly numero = numero;
  protected readonly dataIt = dataIt;
  protected readonly euro = euro;
  protected readonly cent = cent;

  private readonly ordineId = Number(this.query.get('ordine')) || null;
  private readonly righeInevasi = (this.query.get('righe') ?? '').split(',').map(Number).filter(Boolean);
  protected readonly conInevasi = !!this.ordineId && this.nuovo;

  protected readonly stato = signal('Definitivo');
  protected readonly statoSalvato = signal<string | null>(null);
  protected readonly destinazione = signal<SedeId | ''>('');
  protected readonly mittenteId = signal<SedeId | ''>('');
  protected readonly data = signal(this.oggi);
  protected readonly causale = signal('');
  protected readonly ricevutoIl = signal<string | null>(null);
  protected readonly ricevutoDa = signal<string | null>(null);
  protected readonly righe = signal<RigaTrasf[]>([]);
  protected readonly info = signal('');
  protected readonly vecchiAperti = signal(false);
  protected readonly inventario = signal<number | null>(null);
  protected readonly conferma = signal(false);
  private readonly fornitoriSede = new Map<string, Fornitore>();

  // ricerca a mano (pistola)
  protected readonly cercaAperta = signal(false);
  protected readonly trovati = signal<ArticoloRiga[]>([]);
  protected readonly attivo = signal(0);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly salvato = computed(() => this.statoSalvato() !== null);
  /** trasferimento visto dalla sede che lo riceve */
  protected readonly ricevente = computed(() => this.salvato() && this.destinazione() === this.sedeId && this.mittenteId() !== this.sedeId);
  protected readonly spedito = computed(() => ['Definitivo', 'Evaso'].includes(this.statoSalvato() ?? ''));
  protected readonly ricevuto = computed(() => this.spedito() && !!this.ricevutoIl());
  protected readonly daRicevere = computed(() => this.ricevente() && this.spedito() && !this.ricevuto());
  protected readonly daOrdine = computed(() => this.righe().some(r => r.ordineRigaId));
  protected readonly statoMostrato = computed(() => (this.ricevente() && this.spedito() ? (this.ricevuto() ? 'Ricevuto' : 'Da ricevere') : this.stato()));
  protected readonly sediDest = computed(() => this.sede.sedi().filter(s => (s.attiva || s.id === this.destinazione()) && (this.ricevente() || s.id !== this.sedeId)));
  protected readonly pezzi = computed(() => cent(this.righe().reduce((s, r) => s + r.manda, 0)));
  protected readonly valore = computed(() => cent(this.righe().reduce((s, r) => s + r.manda * r.prezzo, 0)));
  protected readonly restano = computed(() => this.righe().filter(r => this.inevasoDi(r) > 0));
  protected readonly modifica$ = computed(() => this.nuovo && this.modifica());
  protected readonly sezioni = computed(() => [
    { k: 'A' as Sezione, titolo: `✔ Da preparare: articoli disponibili dell'ordine #${this.ordineId}`, aiuto: 'quello che non mandi diventa un nuovo inevaso', vuoto: "Nessun articolo dell'ordine è disponibile adesso" },
    { k: 'nuovo' as Sezione, titolo: '⏳ Nuovi inevasi di questo ordine', aiuto: 'qui non ci sono: spunta per mandarli lo stesso', vuoto: "Nessuno: tutti gli articoli dell'ordine sono disponibili" },
    { k: 'vecchio' as Sezione, titolo: '🕑 Inevasi accumulati dagli ordini precedenti', aiuto: 'spunta quelli che puoi mandare ora', vuoto: 'Nessun inevaso precedente per questa filiale' }
  ]);

  constructor() {
    super();
    void this.avvia();
  }

  protected nomeSede_(id: string): string { return this.sede.sedi().find(s => s.id === id)?.nome ?? id; }
  protected inevasoDi(r: RigaTrasf): number { return r.ordinata == null ? 0 : Math.max(0, cent(r.ordinata - r.manda)); }
  protected righeSez(k: Sezione): RigaTrasf[] { return this.righe().filter(r => r.sez === k); }
  protected ancheVecchi(r: RigaTrasf): number {
    return this.conInevasi && r.sez !== 'vecchio' ? this.righe().filter(x => x.sez === 'vecchio' && x.articolo.id === r.articolo.id).reduce((t, x) => t + (x.ordinata ?? 0), 0) : 0;
  }
  protected sezioneChiusa(k: Sezione): boolean { return k === 'vecchio' && !this.vecchiAperti() && this.righeSez(k).length > 0 && !this.righeSez(k).some(r => r.scelto); }

  private async avvia(): Promise<void> {
    try {
      await this.sede.caricaSedi();
      this.mov.inventarioInCorso(this.sedeId).then(i => this.inventario.set(i?.id ?? null), () => undefined);
      const { data: fs } = await this.supabase.client.from('fornitori').select('*').not('sede_collegata', 'is', null);
      ((fs ?? []) as Fornitore[]).forEach(f => f.sede_collegata && this.fornitoriSede.set(f.sede_collegata, f));
      if (!this.nuovo) { await this.leggiSalvato(); return; }
      if (this.ordineId || this.righeInevasi.length) await this.leggiDaOrdine();
      else this.cercaAperta.set(true);
    } catch (e) {
      this.errore.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.caricamento.set(false);
    }
  }

  private async leggiSalvato(): Promise<void> {
    const letto = await this.mov.leggi(this.id()!, this.sedeId);
    if (!letto || letto.mov.tipo !== 'trasferimento_a_filiale') { this.errore.set(`Trasferimento #${this.id()} non trovato`); return; }
    const m = letto.mov;
    this.versione = m.modificato_il;
    this.stato.set(m.stato); this.statoSalvato.set(m.stato);
    this.destinazione.set(m.sede_altra_id ?? ''); this.mittenteId.set(m.sede_id);
    this.data.set(m.data_movimento); this.causale.set(m.causale ?? '');
    this.ricevutoIl.set(m.ricevuto_il); this.ricevutoDa.set(m.ricevuto_da);
    this.righe.set(letto.righe.filter(r => r.articolo).map((r, i) => ({ pos: i + 1, articolo: r.articolo!, ordinata: r.ordinata, manda: r.sped, prezzo: r.prezzo,
      ordineRigaId: r.ordineRigaId, ordineId: null, dataOrdine: null, sez: 'A' as Sezione, scelto: false })));
    this.esciDaModifica();
  }

  /** Ordine di una filiale (o inevasi scelti): la sede che riceve è quella che ha ordinato; la prepara la sede fornitrice. */
  private async leggiDaOrdine(): Promise<void> {
    if (this.ordineId) {
      const { data } = await this.supabase.client.from('movimenti').select('sede_id, fornitori(sede_collegata)').eq('id', this.ordineId).maybeSingle();
      const o = data as { sede_id: SedeId; fornitori: { sede_collegata: SedeId | null } | null } | null;
      const fornitrice = o?.fornitori?.sede_collegata;
      // aperta con un'altra sede di lavoro: si passa da soli a quella che deve preparare l'ordine
      if (fornitrice && fornitrice !== this.sedeId) { this.sede.scegli(fornitrice); this.avvisi.mostra(`Sede di lavoro cambiata in ${this.nomeSede_(fornitrice)}: è lei che prepara questo ordine`); }
      if (o) this.destinazione.set(o.sede_id);
    }
    const lista = await this.supabase.rpc('inevasi_dettaglio', { p_sede_fornitrice: this.sedeId, p_ordine: this.ordineId, p_righe: this.ordineId ? null : this.righeInevasi, p_richiedente: null, p_solo_evasi: false });
    if (lista[0]) this.destinazione.set(lista[0].sede_richiedente);
    if (lista.some(r => r.sede_richiedente !== this.destinazione())) this.avvisi.mostra('Attenzione: gli inevasi scelti sono di filiali diverse; qui c\'è solo la prima', true);
    const rigaDa = (r: InevasoDettaglio, sez: Sezione): Omit<RigaTrasf, 'pos'> => {
      const a = daInevaso(r), residuo = toNumber(r.residuo);
      // si propone di mandare quello che c'è: il resto resta inevaso; gli inevasi partono non spuntati
      return { articolo: a, ordinata: residuo, ordineRigaId: r.ordine_riga_id, ordineId: r.ordine_id, dataOrdine: r.data_ordine, prezzo: a.costo, sez,
        manda: sez === 'A' ? Math.max(0, Math.min(residuo, a.giacenza ?? 0)) : 0, scelto: false };
    };
    const tutte = lista.filter(r => r.sede_richiedente === this.destinazione()).map(r => rigaDa(r, !this.ordineId || toNumber(r.giacenza) > 0 ? 'A' : 'nuovo'));
    if (this.ordineId && this.destinazione()) {
      const vecchi = await this.supabase.rpc('inevasi_dettaglio', { p_sede_fornitrice: this.sedeId, p_ordine: null, p_righe: null, p_richiedente: this.destinazione() as SedeId, p_solo_evasi: true });
      tutte.push(...vecchi.filter(r => r.ordine_id !== this.ordineId).map(r => rigaDa(r, 'vecchio')));
    }
    this.righe.set(tutte.map((r, i) => ({ ...r, pos: i + 1 })));
    const nome = lista[0]?.nome_richiedente ?? '';
    this.info.set(this.ordineId
      ? lista.length ? `📋 Ordine #${this.ordineId} di ${nome} del ${dataIt(lista[0].data_ordine)}: per ogni articolo scegli quanto mandare. Quello che non mandi resta negli inevasi e lo potrai mandare più avanti, senza che ${nome} lo riordini.`
        : `Ordine #${this.ordineId}: non c'è niente da preparare (già preparato o non indirizzato a questa sede).`
      : `⏳ Inevasi di ${nome}: scegli quanto mandare ora. Il resto resta negli inevasi.`);
  }

  // ---------- Righe ----------
  private aggiorna(pos: number, f: (r: RigaTrasf) => void): void { this.righe.update(l => l.map(r => { if (r.pos !== pos) return r; const c = { ...r }; f(c); return c; })); }
  protected passo(r: RigaTrasf, d: number): void { this.aggiorna(r.pos, x => (x.manda = Math.max(0, cent(x.manda + d)))); }
  protected cambiaManda(r: RigaTrasf, e: Event): void { const v = Math.max(0, cent(leggiNumero(this.testo(e)))); this.aggiorna(r.pos, x => (x.manda = v)); }
  protected togli(r: RigaTrasf): void { this.righe.update(l => l.filter(x => x.pos !== r.pos)); }
  /** Inevaso spuntato: si propone quello che c'è in giacenza (se non risulta niente, tutto l'inevaso: si può correggere). */
  protected scegli(r: RigaTrasf, e: Event): void {
    const si = this.spuntato(e), g = r.articolo.giacenza ?? 0;
    this.aggiorna(r.pos, x => { x.scelto = si; x.manda = si ? (g > 0 ? Math.min(x.ordinata ?? 0, g) : x.ordinata ?? 0) : 0; });
  }
  protected tuttoDisponibile(): void { this.righe.update(l => l.map(r => (r.ordinata != null && r.sez === 'A' ? { ...r, manda: Math.max(0, Math.min(r.ordinata, r.articolo.giacenza ?? 0)) } : r))); }
  protected azzera(): void { this.righe.update(l => l.map(r => ({ ...r, manda: 0 }))); }

  // ---------- Aggiunta a mano (anche con la pistola) ----------
  protected scrivi(e: Event): void {
    const t = this.testo(e).trim();
    this.attivo.set(0);
    clearTimeout(this.timer);
    if (t.length < 2) { this.trovati.set([]); return; }
    this.timer = setTimeout(() => void this.cerca(t), 200);
  }
  private async cerca(t: string): Promise<ArticoloRiga[]> {
    const l = (await this.supabase.rpc('cerca_articoli', { p_testo: t, p_sede: this.sedeId, p_fornitore: null, p_solo_fornitore: false, p_sede_altra: null, p_quanti: 30 })).map(articoloDaRicerca);
    this.trovati.set(l);
    return l;
  }
  protected async tasto(e: KeyboardEvent): Promise<void> {
    const campo = e.target as HTMLInputElement;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.attivo.set(Math.min(this.attivo() + 1, this.trovati().length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); this.attivo.set(Math.max(this.attivo() - 1, 0)); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(this.timer);
    const t = campo.value.trim();
    if (!t) return;
    const l = await this.cerca(t);
    const a = l[this.attivo()] ?? l[0];
    if (!a) { this.avvisi.mostra(`Nessun articolo con codice o barcode "${t}"`); return; }
    this.aggiungi(a);
    campo.value = '';
    this.trovati.set([]);
  }
  protected aggiungi(a: ArticoloRiga): void {
    const r = this.righe().find(x => x.articolo.id === a.id && !x.ordineRigaId);
    if (r) this.aggiorna(r.pos, x => (x.manda = cent(x.manda + 1)));
    else this.righe.update(l => [...l, { pos: l.reduce((m, x) => Math.max(m, x.pos), 0) + 1, articolo: a, ordinata: null, manda: 1, prezzo: a.costo, ordineRigaId: null, ordineId: null, dataOrdine: null, sez: 'A', scelto: false }]);
    this.trovati.set([]);
    this.avvisi.mostra(`${a.codice}: ${(r?.manda ?? 0) + 1} da mandare`);
  }

  // ---------- Salva ----------
  protected salva(chiudi: boolean): void {
    void this.conSalvataggio(async () => {
      const dest = this.destinazione();
      if (!dest) { this.avvisi.mostra('Scegli la sede che riceve', true); return; }
      const daMandare = this.righe().filter(r => r.manda > 0);
      const stato = this.stato();
      if (!daMandare.length) {
        if (!this.daOrdine()) { this.avvisi.mostra('Aggiungi almeno un articolo da mandare', true); return; }
        if (!confirm("Non mandi niente: tutti gli articoli dell'ordine restano negli inevasi. Confermi?")) return;
        // Niente da mandare: NON si salva un trasferimento vuoto (prima nasceva e la filiale doveva "confermare" 0 articoli).
        // Gli ordini ancora da preparare passano a Evaso (evadi_ordini_senza_trasferimento, database/34): quello che manca resta negli inevasi.
        const ordini = [...new Set(this.righe().filter(r => r.ordineId && r.sez !== 'vecchio').map(r => r.ordineId!))];
        if (ordini.length) await this.supabase.rpc('evadi_ordini_senza_trasferimento', { p_ordini: ordini });
        this.avvisi.mostra('Nessun trasferimento creato: gli articoli dell\'ordine restano negli inevasi');
        this.esciDaModifica();
        void this.router.navigateByUrl('/trasferimenti/a-filiali');
        return;
      }
      const sopra = daMandare.filter(r => r.ordinata != null && r.manda > r.ordinata);
      if (sopra.length && !confirm(`Per ${sopra.length} articoli mandi più di quanto ordinato. Confermi?`)) return;
      // non si manda più di quello che c'è (stesso articolo su più righe: si somma); il database ricontrolla
      const per = new Map<string, [ArticoloRiga, number]>();
      daMandare.forEach(r => { const p = per.get(r.articolo.id) ?? [r.articolo, 0]; p[1] += r.manda; per.set(r.articolo.id, p); });
      const oltre = [...per.values()].filter(([a, n]) => stato === 'Definitivo' && n > (a.giacenza ?? 0));
      if (oltre.length) {
        this.avvisi.mostra('Non puoi mandare più di quanto c\'è in giacenza: ' + oltre.map(([a, n]) => `${a.codice} (mandi ${n}, ce ne sono ${a.giacenza ?? 0})`).join(', ') + '. Se i pezzi ci sono davvero, prima caricali (es. Aumento giacenza).', true);
        return;
      }
      const m: MovimentoDaSalvare = { tipo: 'trasferimento_a_filiale', stato: stato as MovimentoDaSalvare['stato'], sede_id: this.sedeId, sede_altra_id: dest,
        data_movimento: this.data() || this.oggi, causale: this.causale().trim() || null, ...(sopra.length ? { _oltre_ok: true } : {}) };
      const righe = daMandare.map(r => ({ articolo_id: r.articolo.id, quantita: r.manda, quantita_ordinata: r.ordinata, prezzo: r.prezzo, sconto: 0, etichette: r.manda, ordine_riga_id: r.ordineRigaId }));
      // l'ordine preparato diventa Evaso nella stessa transazione: da qui in poi quello che manca si vede negli inevasi
      const ordini = stato === 'Definitivo' ? [...new Set(this.righe().filter(r => r.ordineId && r.sez !== 'vecchio').map(r => r.ordineId!))] : [];
      const nuovoId = await this.mov.salvaEdEvadi(null, m, righe, null, ordini);
      const inev = this.restano().length;
      this.avvisi.mostra(stato === 'Definitivo' ? `Trasferimento salvato: la merce è uscita, ${this.nomeSede_(dest)} la troverà in "Trasferimenti da Filiali" da confermare${inev ? ` · ${inev} articoli restano negli inevasi` : ''}`
        : 'Trasferimento salvato come provvisorio: la merce non esce finché non è definitivo');
      this.dopoSalvataggio('/trasferimento', nuovoId, chiudi, '/trasferimenti/a-filiali');
    });
  }

  protected annullaNuovo(): void {
    if (!confirm('Uscire senza salvare?')) return;
    this.esciDaModifica();
    void this.router.navigateByUrl('/trasferimenti/a-filiali');
  }

  /** Chi ha mandato può annullare finché non è ricevuto (controllo nel database: annulla_movimento). */
  protected annullaTrasferimento(): void {
    if (!confirm('Annullare questo trasferimento? La merce torna nella giacenza di questa sede e gli articoli tornano negli inevasi.')) return;
    void this.conSalvataggio(async () => {
      await this.mov.annulla(this.id()!);
      this.avvisi.mostra('Trasferimento annullato');
      await this.leggiSalvato();
    });
  }

  /** La sede che riceve conferma: solo ora la merce entra nella sua giacenza (conferma_ricezione). */
  protected confermaRicevuto(): void {
    const pezzi = this.pezzi();
    if (!confirm(`Confermi di aver ricevuto ${this.righe().length} articoli (${pezzi} pezzi) da ${this.nomeSede_(this.mittenteId())}?\n\nDa adesso entrano nella giacenza di ${this.nomeSede}.`)) return;
    void this.conSalvataggio(async () => {
      await this.mov.confermaRicezione(this.id()!);
      this.avvisi.mostra(`Ricevuto: ${pezzi} pezzi aggiunti alla giacenza di ${this.nomeSede}`);
      await this.leggiSalvato();
    });
  }

  protected etichette(): void {
    const anno = Number(this.data().slice(0, 4));
    const righe = this.righe().filter(r => r.manda > 0).map(r => ({
      art: { codice: r.articolo.codice, descr: r.articolo.descrizione, barcode: r.articolo.barcode ?? '', costo: r.prezzo, prezzo: r.articolo.prezzo }, n: Math.max(1, Math.round(r.manda)), anno
    }));
    salvaPerStampa('etichette', { titolo: `Trasferimento #${this.id()}`, ritorno: this.router.url, righe });
    void this.router.navigate(['/etichette'], { queryParams: { da: 'sessione' } });
  }

  /** Nota di preparazione su carta intestata (come l'ordine a fornitore), in una scheda nuova: le quantità messe qui restano. */
  protected stampaNota(): void {
    const lista = this.righe().filter(r => r.manda > 0);
    if (!lista.length) { this.avvisi.mostra('Non c\'è niente da preparare: metti le quantità da mandare'); return; }
    const ric = this.ricevente();
    const mittente = ric ? this.nomeSede_(this.mittenteId()) : this.nomeSede;
    const ricevitore = ric ? this.nomeSede : this.destinazione() ? this.nomeSede_(this.destinazione()) : '';
    const idRic = ric ? this.sedeId : this.destinazione(), idMit = ric ? this.mittenteId() : this.sedeId;
    const estera = SEDI_ESTERE.includes(ricevitore);
    const righeSt = lista.map((r, i) => {
      const iva = estera ? 0 : r.articolo.iva;
      const importo = Math.round(r.manda * r.prezzo * (1 + iva / 100) * 20 + 1e-6) / 20;
      return { n: i + 1, cod: r.articolo.codice, descr: r.articolo.descrizione + (r.sez === 'vecchio' ? ` (inevaso dell'ordine #${r.ordineId} del ${dataIt(r.dataOrdine)})` : ''),
        qta: r.manda.toLocaleString('it-IT', { maximumFractionDigits: 2 }), prezzo: numero(r.prezzo), sconto: '', iva: iva + '%', importo: numero(importo), importoNum: importo };
    });
    const tot = cent(righeSt.reduce((s, r) => s + r.importoNum, 0));
    const ordini = [...new Set(lista.filter(r => r.ordineId && r.sez !== 'vecchio').map(r => r.ordineId))];
    const fMit = this.fornitoriSede.get(idMit) ?? null;
    salvaPerStampa('stampa', {
      titolo: 'Trasferimento a Filiale', sede: mittente,
      mittente: haIntestazione(mittente) || !fMit ? null : [ENTE, ...destinatarioSede(mittente, fMit)],
      info: ([['Data', dataIt(this.data())]] as [string, string][]).concat(this.id() ? [['Numero', `${this.id()}/${this.data().slice(0, 4)}`]] : [], ordini.length ? [['Ordine', ordini.map(o => '#' + o).join(', ')]] : []),
      destinatario: ricevitore ? destinatarioSede(ricevitore, this.fornitoriSede.get(idRic) ?? null) : [],
      colonne: [{ k: 'n', t: '#' }, { k: 'cod', t: 'Codice', cod: true }, { k: 'descr', t: 'Descrizione' }, { k: 'qta', t: 'Quantità', num: true },
        { k: 'prezzo', t: 'Pr. Unit.', num: true }, { k: 'sconto', t: 'Sconto %', num: true }, { k: 'iva', t: 'IVA', num: true }, { k: 'importo', t: 'Importo', num: true }],
      righe: righeSt.map(({ importoNum: _, ...r }) => r),
      totali: [['Totale Articoli', numero(tot)], ['= Totale Complessivo', numero(tot)]],
      note: this.restano().length ? `Restano inevasi (da mandare più avanti): ${this.restano().length} articoli, ${cent(this.restano().reduce((s, r) => s + this.inevasoDi(r), 0))} pezzi.` : '',
      ritorno: this.router.url
    });
    window.open(this.location.prepareExternalUrl('/stampa'), '_blank');
  }

  protected excel(): void {
    const righe = this.righe().filter(r => r.manda > 0);
    if (!righe.length) { this.avvisi.mostra('Non ci sono articoli da mettere nel file Excel'); return; }
    const ric = this.ricevente();
    excelMovimento({ sede: this.nomeSede, tipo: ric ? 'Trasferimento da Filiale' : 'Trasferimento a Filiale', numero: this.id(), ivaInclusa: true,
      riepilogo: [['Data Documento', dataIt(this.data())], ['Stato', this.statoMostrato()], ['Da sede', ric ? this.nomeSede_(this.mittenteId()) : this.nomeSede],
        ['A sede', ric ? this.nomeSede : this.destinazione() ? this.nomeSede_(this.destinazione()) : ''], ['Causale', this.causale()]],
      righe: righe.map(r => ({ codice: r.articolo.codice, descr: r.articolo.descrizione, anno: r.articolo.anno, prezzo: r.prezzo, sconto: 0, qta: r.manda, iva: r.articolo.iva })) });
  }
}
