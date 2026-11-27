import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toNumber } from '../../core/models/database.types';
import type { InevasoInAttesa, MovimentoElencoRiga, RpcFunzioni } from '../../core/models/database.types';
import { SedeService } from '../../core/services/sede.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { ElencoMovimenti, type ConfigElencoMovimenti } from '../../shared/elenco-movimenti';
import { dataIt } from '../../shared/formato';

type Ritorno<N extends keyof RpcFunzioni> = RpcFunzioni[N]['ritorno'];
const q = (v: number | string): string => (Math.round(toNumber(v) * 100) / 100).toLocaleString('it-IT');

/** Carichi da Fornitori (prototipo/carichi-fornitori.html): con il riquadro degli ordini a fornitori da caricare. */
@Component({
  selector: 'app-carichi-fornitori',
  imports: [ElencoMovimenti, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-elenco-movimenti [config]="config">
      @if (ordini().length) {
        <details class="ordini-da-caricare" open>
          <summary>🚚 Ordini a fornitori da caricare: {{ ordini().length }}<small>apri l'ordine quando arriva la merce</small></summary>
          <div class="lista">
            @for (o of ordini(); track o.id) {
              <a [routerLink]="['/carico', 'nuovo']" [queryParams]="{ ordine: o.id }" title="Crea il carico con gli articoli di questo ordine">
                <div class="t"><b>{{ o.fornitore }}</b><small>Ordine {{ o.prot }} del {{ dataIt(o.data) }} · {{ o.righe }} articoli, {{ q(o.pezzi) }} pezzi{{ o.stato === 'Provvisorio' ? ' · provvisorio' : '' }}</small></div>
                <span class="vai">Crea carico →</span></a>
            }
          </div>
        </details>
      }
    </app-elenco-movimenti>
  `
})
export class CarichiFornitori {
  private readonly supabase = inject(SupabaseService);
  private readonly sede = inject(SedeService);
  protected readonly dataIt = dataIt;
  protected readonly q = q;
  protected readonly ordini = signal<Ritorno<'ordini_da_caricare'>>([]);
  protected readonly config: ConfigElencoMovimenti = {
    titolo: 'Carichi da Fornitori', tipo: 'carico_fornitore', csv: 'carichi-fornitori', controparte: 'Fornitore',
    stati: ['Definitivo', 'Provvisorio', 'Annullato'],
    colonne: ['numero', 'stato', 'data', 'controparte', 'bolla', 'causale', 'tot_art', 'totale', 'pezzi'],
    titoli: { data: 'Carico', controparte: 'Fornitore' },
    nuovo: { testo: 'Nuovo carico', percorso: ['/carico', 'nuovo'] }
  };
  constructor() {
    this.supabase.rpc('ordini_da_caricare', { p_sede: this.sede.sedeId() ?? '' }).then(o => this.ordini.set(o), () => this.ordini.set([]));
  }
}

/** Ordini a Fornitori (prototipo/ordini-fornitori.html): con il tasto INEVASI IN ATTESA (merce ordinata alle altre sedi e non arrivata). */
@Component({
  selector: 'app-ordini-fornitori',
  imports: [ElencoMovimenti, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-elenco-movimenti [config]="config">
      @if (mostraInevasi()) {
        <a azioni routerLink="/trasferimenti/inevasi" [queryParams]="{ vista: 'attesa' }" class="btn-inevasi-top" [class.zero]="!articoliInAttesa()"
           title="Articoli ordinati e non ancora arrivati: non vanno riordinati">⏳ INEVASI IN ATTESA <span class="num">{{ articoliInAttesa() }}</span></a>
      }
    </app-elenco-movimenti>
  `
})
export class OrdiniFornitori {
  private readonly supabase = inject(SupabaseService);
  private readonly sede = inject(SedeService);
  protected readonly articoliInAttesa = signal(0);
  protected readonly mostraInevasi = computed(() => this.sede.sedeId() !== 'magazzino-centrale' || this.articoliInAttesa() > 0);
  protected readonly config: ConfigElencoMovimenti = {
    titolo: 'Ordini a Fornitori', tipo: 'ordine_fornitore', csv: 'ordini-fornitori', controparte: 'Fornitore',
    stati: ['Provvisorio', 'Definitivo', 'Con inevasi', 'Evaso', 'Annullato'],
    colonne: ['numero', 'stato', 'data', 'controparte', 'causale', 'arrivato', 'totale', 'pezzi'],
    titoli: { numero: 'Protocollo / Mov.', controparte: 'Fornitore' },
    nuovo: { testo: 'Nuovo ordine', percorso: ['/ordine', 'nuovo'] }
  };
  constructor() {
    this.supabase.rpc('inevasi_in_attesa', { p_sede: this.sede.sedeId() ?? '' })
      .then(r => this.articoliInAttesa.set(new Set(r.map(x => x.articolo_id)).size), () => this.articoliInAttesa.set(0));
  }
}

/** Trasferimenti a Filiali (prototipo/trasferimenti-a-filiali.html): ordini delle filiali da preparare e tasto INEVASI. */
@Component({
  selector: 'app-trasferimenti-a-filiali',
  imports: [ElencoMovimenti, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-elenco-movimenti [config]="config">
      @if (mostraInevasi()) {
        <a azioni routerLink="/trasferimenti/inevasi" class="btn-inevasi-top" [class.zero]="!ordiniInevasi()" title="Ordini delle filiali con articoli non ancora mandati">⏳ INEVASI <span class="num">{{ ordiniInevasi() }}</span></a>
      }
      @if (daPreparare().length) {
        <details class="ordini-da-caricare" open>
          <summary>📦 Ordini delle filiali da preparare: {{ daPreparare().length }}<small>quello che non c'è resta negli inevasi</small></summary>
          <div class="lista">
            @for (o of daPreparare(); track o.id) {
              <a [routerLink]="['/trasferimento', 'nuovo']" [queryParams]="{ ordine: o.id }">
                <div class="t"><b>{{ o.da }} · ordine #{{ o.id }}</b><small>del {{ dataIt(o.data) }} · {{ o.righe }} articoli, {{ q(o.pezzi) }} pezzi · disponibili ora {{ o.disponibili }} di {{ o.righe }}</small></div>
                <span class="vai">Apri →</span></a>
            }
          </div>
        </details>
      }
    </app-elenco-movimenti>
  `
})
export class TrasferimentiAFiliali {
  private readonly supabase = inject(SupabaseService);
  private readonly sede = inject(SedeService);
  protected readonly dataIt = dataIt;
  protected readonly q = q;
  protected readonly daPreparare = signal<Ritorno<'ordini_da_preparare'>>([]);
  protected readonly ordiniInevasi = signal(0);
  protected readonly mostraInevasi = computed(() => this.sede.sedeId() === 'magazzino-centrale' || this.ordiniInevasi() > 0);
  protected readonly config: ConfigElencoMovimenti = {
    titolo: 'Trasferimenti a Filiali', tipo: 'trasferimento_a_filiale', csv: 'trasferimenti-a-filiali', controparte: 'Sede di destinazione',
    nota: '🔄 Scegli la <b>sede che riceve</b>: quando il trasferimento è <b>definitivo</b> la merce esce da qui; entra nella giacenza dell\'altra sede quando lei <b>conferma il ricevuto</b>. Verso le sedi estere senza IVA (0%).',
    stati: ['Definitivo', 'Provvisorio', 'Annullato'],
    colonne: ['numero', 'stato', 'data', 'controparte', 'causale', 'totale', 'pezzi'],
    titoli: { numero: 'Protocollo / Mov.', controparte: 'Verso sede' },
    nuovo: { testo: 'Nuovo trasferimento', percorso: ['/trasferimento', 'nuovo'] }
  };
  constructor() {
    const s = this.sede.sedeId() ?? '';
    this.supabase.rpc('ordini_da_preparare', { p_sede: s }).then(o => this.daPreparare.set(o), () => this.daPreparare.set([]));
    this.supabase.rpc('dashboard_sede', { p_sede: s }).then(d => this.ordiniInevasi.set(d.inevasi?.ordini ?? 0), () => this.ordiniInevasi.set(0));
  }
}

/**
 * Trasferimenti da Filiali (prototipo/trasferimenti-da-filiali.html): arrivano da soli; "Da ricevere" finché non si conferma.
 * Riquadri: merce in arrivo da confermare, ordini alle sedi in attesa; scheda "⏳ In attesa" con gli inevasi.
 */
@Component({
  selector: 'app-trasferimenti-da-filiali',
  imports: [ElencoMovimenti, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-elenco-movimenti [config]="config">
      <button schede class="tab tab-attesa" [class.active]="inAttesa()" (click)="inAttesa.set(!inAttesa())" title="Prodotti ordinati e non ancora partiti">⏳ In attesa<span class="n">{{ articoliInAttesa() }}</span></button>
      @if (inAttesa()) {
        <section class="panel">
          <h2 class="titolo-attesa">⏳ Prodotti ordinati e non ancora arrivati</h2>
          <p class="sotto-attesa">Sono gli <b>inevasi</b>: ordinati ad un'altra sede e non ancora spediti. Si aggiornano da soli quando la merce parte e confermi il ricevuto.</p>
          @if (attesa().length) {
            <div class="table-wrap"><table>
              <thead><tr><th>Articolo</th><th>Da quale sede</th><th>Ordine</th><th class="num">Ordinata</th><th class="num">Già arrivata</th><th class="num">Ancora in attesa</th><th>Stato</th></tr></thead>
              <tbody>
                @for (r of attesa(); track r.ordine_riga_id) {
                  <tr><td><span class="codice">{{ r.codice }}</span> {{ r.descrizione }}</td><td>{{ r.sede }}</td>
                    <td><a class="num-mov" [routerLink]="['/ordine', r.ordine_id]"><span class="id">#{{ r.ordine_id }}</span></a> <small style="color:var(--muted)">{{ dataIt(r.data_ordine) }}</small></td>
                    <td class="num">{{ q(r.ordinata) }}</td><td class="num">{{ q(r.trasferita) }}</td><td class="num"><b style="color:#7c4dff">{{ q(r.residuo) }}</b></td>
                    <td><small>{{ r.stato_ordine === 'Definitivo' ? 'ordine non ancora preparato' : 'in attesa della merce' }}</small></td></tr>
                }
              </tbody>
            </table></div>
          } @else { <div class="vuoto"><b>Niente in attesa</b><span>Tutto quello che avete ordinato alle altre sedi è già partito.</span></div> }
        </section>
      }
      @if (arrivi().length) {
        <details class="ordini-da-caricare" open style="border-left-color:#0891b2">
          <summary>📦 Merce in arrivo da confermare: {{ arrivi().length }}<small>aprila, stampa le etichette e conferma: solo allora entra in giacenza</small></summary>
          <div class="lista">
            @for (a of arrivi(); track a.id) {
              <a [routerLink]="['/trasferimento', a.id]"><div class="t"><b>{{ a.controparte }} · trasferimento #{{ a.id }}</b><small>del {{ dataIt(a.data) }} · {{ q(a.pezzi) }} pezzi</small></div>
                <span class="vai" style="background:#0891b2">Apri e conferma →</span></a>
            }
          </div>
        </details>
      }
      @if (ordiniSedi().length) {
        <details class="ordini-da-caricare" open>
          <summary>📦 Ordini alle sedi in attesa: {{ ordiniSedi().length }}<small>quando la merce parte, premi Ricevi</small></summary>
          <div class="lista">
            @for (o of ordiniSedi(); track o.id) {
              <a [routerLink]="o.trasferimento_da_ricevere ? ['/trasferimento', o.trasferimento_da_ricevere] : ['/ordine', o.id]">
                <div class="t"><b>{{ o.sede }}</b><small>Ordine {{ o.prot }} del {{ dataIt(o.data) }} · {{ o.righe }} articoli, {{ q(o.pezzi) }} pezzi ·
                  {{ o.trasferimento_da_ricevere ? 'merce partita, da ricevere' : o.stato === 'Evaso' ? 'mandato in parte, il resto è in attesa' : 'ordine inviato, da preparare' }}</small></div>
                <span class="vai" [style.background]="o.trasferimento_da_ricevere ? '' : '#eef1f6'" [style.color]="o.trasferimento_da_ricevere ? '' : 'var(--text)'">{{ o.trasferimento_da_ricevere ? 'Ricevi →' : 'Vedi ordine →' }}</span></a>
            }
          </div>
        </details>
      }
    </app-elenco-movimenti>
  `,
  styles: `
    .titolo-attesa { margin: 0 0 4px; font-size: 1rem; color: #5b21b6; }
    .sotto-attesa { margin: 0 0 12px; color: var(--muted); font-size: 0.86rem; }
    .tab-attesa { margin-left: 10px; border: 1px solid #cdb8f5 !important; color: #5b21b6 !important; }
    .tab-attesa.active { background: #f1ecff !important; }
  `
})
export class TrasferimentiDaFiliali {
  private readonly supabase = inject(SupabaseService);
  private readonly sede = inject(SedeService);
  protected readonly dataIt = dataIt;
  protected readonly q = q;
  protected readonly inAttesa = signal(false);
  protected readonly attesa = signal<InevasoInAttesa[]>([]);
  protected readonly articoliInAttesa = computed(() => new Set(this.attesa().map(r => r.articolo_id)).size);
  protected readonly arrivi = signal<MovimentoElencoRiga[]>([]);
  protected readonly ordiniSedi = signal<Ritorno<'ordini_alle_sedi'>>([]);
  protected readonly config: ConfigElencoMovimenti = {
    titolo: 'Trasferimenti da Filiali', tipo: 'trasferimento_a_filiale', inArrivo: true, csv: 'trasferimenti-da-filiali', controparte: 'Sede di provenienza',
    nota: '🔄 <b>Arrivano in automatico.</b> Quando un\'altra sede manda la merce qui, il movimento compare come <b>Da ricevere</b>. Aprilo, controlla gli articoli, stampa le etichette e premi <b>Conferma ricevuto</b>: solo allora la merce entra nella giacenza di questa sede.',
    stati: ['Da ricevere', 'Ricevuto', 'Provvisorio', 'Annullato'],
    colonne: ['numero', 'stato', 'data', 'controparte', 'bolla', 'causale', 'totale', 'pezzi'],
    titoli: { numero: 'Protocollo / Mov.', controparte: 'Da sede' }
  };
  constructor() {
    const s = this.sede.sedeId() ?? '';
    this.supabase.rpc('inevasi_in_attesa', { p_sede: s }).then(r => this.attesa.set(r), () => this.attesa.set([]));
    this.supabase.rpc('ordini_alle_sedi_in_attesa', { p_sede: s }).then(r => this.ordiniSedi.set(r), () => this.ordiniSedi.set([]));
    this.supabase.rpc('movimenti_elenco', { p_sede: s, p_tipo: 'trasferimento_a_filiale', p_in_arrivo: true, p_canale: null, p_cerca: null, p_dal: null, p_al: null,
      p_anno: null, p_controparte: null, p_articolo: null, p_stato: 'Da ricevere', p_ordina: 'data', p_crescente: true, p_da: 0, p_quanti: 100 })
      .then(r => this.arrivi.set(r), () => this.arrivi.set([]));
  }
}

/**
 * Vendite Giornaliere (prototipo/vendite-giornaliere.html): ?canale=ecommerce = solo le giornate online, senza = solo il negozio.
 * Tasti uniti "Vendite del centro / Vendite e-commerce" sempre nello stesso posto; nell'e-commerce "Nuova vendita e-commerce" (apre la giornata di oggi se c'è già).
 */
@Component({
  selector: 'app-vendite-giornaliere',
  imports: [ElencoMovimenti, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (config(); as c) {
      <app-elenco-movimenti [config]="c">
        <div azioni class="scelta-canale" role="tablist" aria-label="Quali vendite vedere">
          <a routerLink="/movimenti/vendite-giornaliere" role="tab" [class.attivo]="!ecom()" title="Le giornate di vendita del centro">🏪 Vendite del centro</a>
          <a routerLink="/movimenti/vendite-giornaliere" [queryParams]="{ canale: 'ecommerce' }" role="tab" [class.attivo]="ecom()" title="Le giornate di vendite online">🛒 Vendite e-commerce</a>
        </div>
        @if (ecom()) {
          <ng-container azioni>
          <a class="btn btn-light" style="color:#5b21b6;border-color:#cdb8f5" routerLink="/stampe/trasferimento-ecommerce" title="Stampa del mese per la Sede Centrale dell'Apostolato Liturgico">🖨️ Trasferimento del mese</a>
          <button class="btn btn-primary" (click)="vendite()">＋ Nuova vendita e-commerce</button>
          </ng-container>
        }
      </app-elenco-movimenti>
    }
  `
})
export class VenditeGiornaliere {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  private readonly sede = inject(SedeService);
  protected readonly ecom = signal(false);
  protected readonly oggi = signal<number | null>(null);
  protected readonly config = computed<ConfigElencoMovimenti>(() => this.ecom()
    ? { titolo: 'Vendite e-commerce', tipo: 'vendite_giornaliere', canale: 'ecommerce', csv: 'vendite-ecommerce', stati: ['Definitivo', 'Annullato'],
        nota: '🛒 Una giornata per ogni giorno di vendite online: la merce esce dalla giacenza della sede in cui lavori. Durante il giorno si aprono le <b>vendite di oggi</b> e si aggiungono gli articoli man mano, con l\'ora.',
        colonne: ['giorno', 'causale', 'tot_art', 'totale', 'pezzi'] }
    : { titolo: 'Vendite Giornaliere', tipo: 'vendite_giornaliere', canale: 'negozio', csv: 'vendite-giornaliere', stati: ['Definitivo', 'Annullato'],
        colonne: ['giorno', 'causale', 'tot_art', 'totale', 'pezzi'], nuovo: { testo: 'Nuova vendita', percorso: ['/vendita', 'nuovo'] } });

  constructor() {
    this.route.queryParamMap.subscribe(p => {
      this.ecom.set(p.get('canale') === 'ecommerce');
      if (this.ecom()) void this.cercaOggi();
    });
  }

  /** "Vendite e-commerce di oggi": se la giornata di oggi c'è già si apre lì, pronta per aggiungere articoli. */
  private async cercaOggi(): Promise<void> {
    const oggi = new Date().toLocaleDateString('sv-SE');
    try {
      const r = await this.supabase.rpc('movimenti_elenco', { p_sede: this.sede.sedeId() ?? '', p_tipo: 'vendite_giornaliere', p_in_arrivo: false, p_canale: 'ecommerce',
        p_cerca: null, p_dal: oggi, p_al: oggi, p_anno: null, p_controparte: null, p_articolo: null, p_stato: 'Definitivo', p_ordina: 'data', p_crescente: false, p_da: 0, p_quanti: 1 });
      this.oggi.set(r[0]?.id ?? null);
    } catch { this.oggi.set(null); }
  }

  protected vendite(): void {
    const id = this.oggi();
    if (id) void this.router.navigate(['/vendita', id], { queryParams: { modifica: 1 } });
    else void this.router.navigate(['/vendita', 'nuovo'], { queryParams: { canale: 'ecommerce' } });
  }
}

/** Aumento Giacenza (prototipo/aumento-giacenza.html). */
@Component({
  selector: 'app-aumento-giacenza',
  imports: [ElencoMovimenti],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-elenco-movimenti [config]="config" />`
})
export class AumentoGiacenza {
  protected readonly config: ConfigElencoMovimenti = {
    titolo: 'Aumento Giacenza', tipo: 'aumento_giacenza', csv: 'aumento-giacenza', stati: ['Definitivo', 'Provvisorio', 'Annullato'],
    nota: '➕ Per la merce che entra <b>senza un fornitore</b>: ritrovata all\'inventario, arrivata da altri centri o da sedi chiuse, donata. Quando è <b>definitivo</b> la merce entra nella giacenza di questa sede, con l\'anno di acquisto scelto (si stampa sulle etichette).',
    colonne: ['numero', 'stato', 'data', 'causale', 'tot_art', 'totale', 'pezzi'],
    nuovo: { testo: 'Nuovo aumento', percorso: ['/aumento', 'nuovo'] }
  };
}

/** Diminuzione Giacenza (prototipo/diminuzione-giacenza.html). */
@Component({
  selector: 'app-diminuzione-giacenza',
  imports: [ElencoMovimenti],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-elenco-movimenti [config]="config" />`
})
export class DiminuzioneGiacenza {
  protected readonly config: ConfigElencoMovimenti = {
    titolo: 'Diminuzione Giacenza', tipo: 'diminuzione_giacenza', csv: 'diminuzione-giacenza', stati: ['Definitivo', 'Provvisorio', 'Annullato'],
    nota: '➖ Per la merce che esce <b>senza essere venduta né trasferita</b>: rotta, mancante all\'inventario, smarrita, usata internamente. Quando è <b>definitiva</b> la merce esce dalla giacenza di questa sede (dal lotto più vecchio).',
    colonne: ['numero', 'stato', 'data', 'causale', 'tot_art', 'totale', 'pezzi'],
    nuovo: { testo: 'Nuova diminuzione', percorso: ['/diminuzione', 'nuovo'] }
  };
}

/** Scarichi a Clienti (prototipo/scarichi-clienti.html): si fanno nella scheda ordine-cliente con tipo=scarico. */
@Component({
  selector: 'app-scarichi-clienti',
  imports: [ElencoMovimenti],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-elenco-movimenti [config]="config" />`
})
export class ScarichiClienti {
  protected readonly config: ConfigElencoMovimenti = {
    titolo: 'Scarichi a Clienti', tipo: 'scarico_cliente', csv: 'scarichi-clienti', controparte: 'Cliente', stati: ['Definitivo', 'Provvisorio', 'Annullato'],
    colonne: ['numero', 'stato', 'data', 'controparte', 'bolla', 'causale', 'totale', 'pezzi'],
    titoli: { numero: 'Protocollo / N. bolla', controparte: 'Cliente', bolla: 'Data bolla' },
    nuovo: { testo: 'Nuovo scarico', percorso: ['/ordine-cliente', 'nuovo'], query: { tipo: 'scarico' } }
  };
}

/** Ordini da Clienti (prototipo/ordini-clienti.html): con gli ordini ricevuti dalle filiali (si preparano con un trasferimento). */
@Component({
  selector: 'app-ordini-clienti',
  imports: [ElencoMovimenti, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-elenco-movimenti [config]="config">
      @if (daPreparare().length || ordiniInevasi()) {
        <details class="ordini-da-caricare" open>
          <summary>🏬 Ordini ricevuti dalle filiali: {{ daPreparare().length }}<small>si preparano con un trasferimento a filiale: quello che manca resta negli inevasi</small></summary>
          <div class="lista">
            @for (o of daPreparare(); track o.id) {
              <a [routerLink]="['/trasferimento', 'nuovo']" [queryParams]="{ ordine: o.id }" title="Prepara il trasferimento con gli articoli di questo ordine">
                <div class="t"><b>{{ o.da }}</b><small>Ordine #{{ o.id }} del {{ dataIt(o.data) }} · {{ o.righe }} articoli, {{ q(o.pezzi) }} pezzi</small></div>
                <span class="vai">Prepara trasferimento →</span></a>
            }
            @if (ordiniInevasi()) {
              <a routerLink="/trasferimenti/inevasi" title="Articoli ordinati dalle filiali e non ancora mandati">
                <div class="t"><b>⏳ Inevasi in attesa</b><small>{{ ordiniInevasi() }} ordini con articoli ancora da mandare (ognuno una volta sola)</small></div>
                <span class="vai">Vedi inevasi →</span></a>
            }
          </div>
        </details>
      }
    </app-elenco-movimenti>
  `
})
export class OrdiniClienti {
  private readonly supabase = inject(SupabaseService);
  private readonly sede = inject(SedeService);
  protected readonly dataIt = dataIt;
  protected readonly q = q;
  protected readonly daPreparare = signal<Ritorno<'ordini_da_preparare'>>([]);
  protected readonly ordiniInevasi = signal(0);
  protected readonly config: ConfigElencoMovimenti = {
    titolo: 'Ordini da Clienti', tipo: 'ordine_cliente', csv: 'ordini-clienti', controparte: 'Cliente', stati: ['Provvisorio', 'Definitivo', 'Evaso', 'Annullato'],
    colonne: ['numero', 'stato', 'data', 'controparte', 'causale', 'totale', 'pezzi'],
    titoli: { numero: 'Numero / N. bolla', controparte: 'Cliente' },
    nuovo: { testo: 'Nuovo ordine cliente', percorso: ['/ordine-cliente', 'nuovo'] }
  };
  constructor() {
    const s = this.sede.sedeId() ?? '';
    this.supabase.rpc('ordini_da_preparare', { p_sede: s }).then(o => this.daPreparare.set(o), () => this.daPreparare.set([]));
    this.supabase.rpc('dashboard_sede', { p_sede: s }).then(d => this.ordiniInevasi.set(d.inevasi?.ordini ?? 0), () => this.ordiniInevasi.set(0));
  }
}

/** Riallineamenti Giacenza = inventari (prototipo/riallineamenti-giacenza.html). */
@Component({
  selector: 'app-riallineamenti',
  imports: [ElencoMovimenti, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // tasto per il foglio A4 dei cartellini degli anni da sparare dopo l'articolo (come il prototipo)
  template: `<app-elenco-movimenti [config]="config">
    <a azioni class="btn btn-light" routerLink="/inventario/cartellini-anni" title="Foglio A4 con i barcode degli anni da sparare dopo l'articolo">🏷️ Cartellini degli anni</a>
  </app-elenco-movimenti>`
})
export class Riallineamenti {
  protected readonly config: ConfigElencoMovimenti = {
    titolo: 'Inventario', tipo: 'riallineamento', csv: 'riallineamenti-giacenza', stati: ['Provvisorio', 'Definitivo', 'Annullato'],
    nota: '📋 L\'<b>inventario</b>: si sparano tutti i pezzi con la pistola e alla conferma la giacenza diventa quella contata (tutta sull\'anno in corso). Mentre un inventario è <b>in corso</b> in questa sede non fare vendite né scarichi.',
    colonne: ['numero', 'stato', 'data', 'causale', 'tot_art', 'totale', 'pezzi'],
    titoli: { pezzi: 'Differenza pezzi' },
    nuovo: { testo: 'Nuovo inventario', percorso: ['/inventario', 'nuovo'] }
  };
}

/** Tutti i Movimenti (prototipo/tutti-movimenti.html): si consulta, un clic apre il movimento nella sua scheda. */
@Component({
  selector: 'app-tutti-movimenti',
  imports: [ElencoMovimenti],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-elenco-movimenti [config]="config" />`
})
export class TuttiMovimenti {
  protected readonly config: ConfigElencoMovimenti = {
    titolo: 'Tutti i Movimenti', tipo: null, csv: 'tutti-movimenti', controparte: 'Cliente / Fornitore / Sede',
    stati: ['Definitivo', 'Provvisorio', 'Con inevasi', 'Evaso', 'Da ricevere', 'Ricevuto', 'Annullato'],
    colonne: ['numero', 'tipo', 'stato', 'data', 'controparte', 'bolla', 'causale', 'tot_art', 'totale', 'pezzi'],
    titoli: { numero: 'Data / Numero', data: 'Data documento', controparte: 'Cliente / Fornitore', bolla: 'Data bolla', tot_art: 'Totale articoli', totale: 'Totale compless.', pezzi: 'Numero articoli' }
  };
}
