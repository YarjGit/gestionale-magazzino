import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** Piede delle liste: righe per pagina, "Pagina N di M", avanti e indietro (come il prototipo). La pagina parte da 0. */
@Component({
  selector: 'app-paginatore',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagine">
      <span>Righe</span>
      <select [value]="perPagina()" (change)="perPaginaCambiata.emit(+valore($event))">
        @for (n of scelte; track n) { <option [value]="n" [selected]="n === perPagina()">{{ n }}</option> }
      </select>
      <span>Pagina {{ pagina() + 1 }} di {{ pagine() }}</span>
      <button aria-label="Pagina precedente" [disabled]="pagina() <= 0 || caricamento()" (click)="paginaCambiata.emit(pagina() - 1)">‹</button>
      <button aria-label="Pagina successiva" [disabled]="pagina() + 1 >= pagine() || caricamento()" (click)="paginaCambiata.emit(pagina() + 1)">›</button>
    </div>
  `
})
export class Paginatore {
  readonly pagina = input.required<number>();
  readonly perPagina = input.required<number>();
  readonly totale = input.required<number>();
  readonly caricamento = input(false);
  readonly paginaCambiata = output<number>();
  readonly perPaginaCambiata = output<number>();
  protected readonly scelte = [10, 25, 50, 100];
  protected readonly pagine = computed(() => Math.max(1, Math.ceil(this.totale() / this.perPagina())));
  protected valore(e: Event): string {
    return (e.target as HTMLSelectElement).value;
  }
}
