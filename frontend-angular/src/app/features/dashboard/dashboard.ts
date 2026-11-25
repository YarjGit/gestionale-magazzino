import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SedeService } from '../../core/services/sede.service';

/** Dashboard: la versione completa arriva al passo 6 della migrazione. */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head"><div><h1 class="page-title">Dashboard</h1></div></div>
    <section class="panel"><p class="empty">Sede di lavoro: <b>{{ sede.sede()?.nome }}</b>.</p></section>
  `
})
export class Dashboard {
  protected readonly sede = inject(SedeService);
}
