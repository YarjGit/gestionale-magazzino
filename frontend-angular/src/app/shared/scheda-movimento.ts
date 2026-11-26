import { ChangeDetectionStrategy, Component, computed, Directive, inject, input, OnDestroy, output, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { SedeId } from '../core/models/database.types';
import { ModificheService } from '../core/services/modifiche.service';
import { SedeService } from '../core/services/sede.service';
import { AvvisiService } from './avvisi.service';
import { euro } from './formato';
import { STATI } from './elenco-movimenti';

/** Intestazione comune delle schede movimento: titolo con stato, totale in alto a destra, tasti, avvisi. */
@Component({
  selector: 'app-testa-scheda',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scheda-head">
      <div>
        <h1 class="page-title">{{ titolo() }} @if (numero()) { <span class="num">#{{ numero() }}</span> }
          <span class="pill" [style.background]="colore() + '1f'" [style.color]="colore()">{{ icona() }} {{ stato() }}</span></h1>
        <div class="crumbs"><a routerLink="/dashboard">⌂</a><span>-</span><span>Movimenti</span><span>-</span>
          <a [routerLink]="elenco()">{{ nomeElenco() }}</a><span>-</span><span>{{ numero() ? '#' + numero() : 'Nuovo' }}</span></div>
      </div>
      <div class="totale-top">
        <div class="t">{{ etichettaTotale() }}</div>
        <div class="v">{{ euro(totale()) }}</div>
        <div class="p">{{ sotto() }}</div>
      </div>
    </div>
    <div class="azioni-scheda">
      @if (modifica()) {
        <button class="btn btn-light" (click)="annulla.emit()" [disabled]="salvataggio()">✕ Annulla</button>
        <button class="btn btn-primary" (click)="salva.emit(false)" [disabled]="salvataggio()">💾 {{ salvataggio() ? 'Salvo…' : 'Salva' }}</button>
        <button class="btn btn-verde" (click)="salva.emit(true)" [disabled]="salvataggio()">✔ Salva e chiudi</button>
      } @else {
        <ng-content />
        <button class="btn btn-light" [routerLink]="elenco()">✕ Chiudi</button>
        @if (modificabile()) { <button class="btn btn-verde" (click)="modificaClick.emit()">✎ Modifica</button> }
      }
    </div>
    @if (stato() === 'Annullato') { <div class="banner ann">✕ Questo movimento è annullato: non incide sulle giacenze e non si può modificare.</div> }
    @if (modifica() && testoModifica()) { <div class="banner mod">✎ {{ testoModifica() }}</div> }
    @if (inventario(); as inv) {
      <div class="banner ann" style="margin-bottom:12px">📋 <span><b>Inventario in corso</b> in questa sede: non fare vendite né scarichi finché non è confermato.
        <a [routerLink]="['/inventario', inv]" style="color:inherit;font-weight:700">Apri l'inventario</a></span></div>
    }
  `,
  styles: `.azioni-scheda { display: flex; justify-content: flex-end; gap: 8px; margin: 10px 0 12px; flex-wrap: wrap; }`
})
export class TestaScheda {
  readonly titolo = input.required<string>();
  readonly numero = input<number | null>(null);
  readonly stato = input('Provvisorio');
  readonly totale = input(0);
  readonly etichettaTotale = input('Totale articoli');
  readonly sotto = input('');
  readonly elenco = input.required<string>();
  readonly nomeElenco = input.required<string>();
  readonly modifica = input(false);
  readonly modificabile = input(true);
  readonly salvataggio = input(false);
  readonly testoModifica = input('');
  readonly inventario = input<number | null>(null);
  readonly modificaClick = output<void>();
  readonly annulla = output<void>();
  readonly salva = output<boolean>();
  protected readonly euro = euro;
  protected readonly colore = computed(() => STATI[this.stato()]?.colore ?? '#64748b');
  protected readonly icona = computed(() => STATI[this.stato()]?.icona ?? '•');
}

/**
 * Base delle schede movimento: id dalla rotta (/carico/12, /carico/nuovo), modalità modifica, versione letta (per il
 * controllo CONFLITTO del database), doppio clic bloccato, "sto modificando" per il menu e la chiusura della scheda.
 */
@Directive()
export abstract class SchedaBase implements OnDestroy {
  protected readonly route = inject(ActivatedRoute);
  protected readonly router = inject(Router);
  protected readonly avvisi = inject(AvvisiService);
  protected readonly modifiche = inject(ModificheService);
  protected readonly sede = inject(SedeService);

  protected readonly idRotta = this.route.snapshot.paramMap.get('id');
  protected readonly nuovo = this.idRotta === 'nuovo' || this.idRotta === null;
  protected readonly id = signal<number | null>(this.nuovo ? null : Number(this.idRotta));
  protected readonly query = this.route.snapshot.queryParamMap;
  protected readonly modifica = signal(this.nuovo);
  protected readonly salvataggio = signal(false);
  protected readonly caricamento = signal(!this.nuovo);
  protected readonly errore = signal<string | null>(null);
  protected readonly tab = signal('dettagli');
  protected versione: string | null = null;
  protected readonly oggi = new Date().toLocaleDateString('sv-SE');

  protected get sedeId(): SedeId { return this.sede.sedeId() ?? ''; }
  protected get nomeSede(): string { return this.sede.sede()?.nome ?? ''; }

  constructor() {
    if (this.nuovo) this.modifiche.imposta(true);
  }
  ngOnDestroy(): void { this.modifiche.imposta(false); }

  protected entraInModifica(): void { this.modifica.set(true); this.modifiche.imposta(true); }
  protected esciDaModifica(): void { this.modifica.set(false); this.modifiche.imposta(false); }

  /** Esegue il salvataggio una volta sola (doppio clic), mostra l'errore del database in italiano semplice. */
  protected async conSalvataggio(lavoro: () => Promise<void>): Promise<void> {
    if (this.salvataggio()) return;
    this.salvataggio.set(true);
    try { await lavoro(); }
    catch (e) { this.avvisi.mostra(e instanceof Error ? e.message : String(e), true); }
    finally { this.salvataggio.set(false); }
  }

  /** Dopo il salvataggio: si riapre la scheda salvata in sola lettura, o si torna all'elenco. */
  protected dopoSalvataggio(pagina: string, nuovoId: number, chiudi: boolean, elenco: string): void {
    this.esciDaModifica();
    if (chiudi) void this.router.navigateByUrl(elenco);
    else void this.router.navigateByUrl('/caricamento', { skipLocationChange: true }).then(() => this.router.navigate([pagina, nuovoId], { replaceUrl: true }));
  }

  protected testo(e: Event): string { return (e.target as HTMLInputElement).value; }
  protected spuntato(e: Event): boolean { return (e.target as HTMLInputElement).checked; }
  protected oraIt(iso: string): string {
    const d = new Date(iso);
    return `${d.toLocaleDateString('it-IT')} · ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
  }
}
