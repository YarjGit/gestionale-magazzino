import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SedeService } from '../../core/services/sede.service';
import { RegistroService } from '../../core/services/registro.service';
import { AvvisiService } from '../../shared/avvisi.service';
import { coloreTesto } from '../../shared/formato';
import type { Sede } from '../../core/models/database.types';

/** "Da quale sede lavori oggi?" (finestra di scelta sede del prototipo). */
@Component({
  selector: 'app-scegli-sede',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-bg show">
      <div class="modal" role="dialog" aria-label="Scelta sede">
        <h2>Da quale sede lavori oggi?</h2>
        <p>Potrai cambiarla in qualsiasi momento dal tasto colorato in alto.</p>
        <div class="sedi-grid">
          @for (s of sede.sediAttive(); track s.id) {
            <button [class.plain]="!s.colore" [style.background]="s.colore" [style.color]="coloreTesto(s.colore)" (click)="scegli(s)">{{ s.nome }}</button>
          } @empty {
            <p class="empty">Lettura delle sedi…</p>
          }
        </div>
      </div>
    </div>
  `
})
export class ScegliSede implements OnInit {
  protected readonly sede = inject(SedeService);
  private readonly router = inject(Router);
  private readonly registro = inject(RegistroService);
  private readonly avvisi = inject(AvvisiService);
  protected readonly coloreTesto = coloreTesto;

  ngOnInit(): void {
    void this.sede.caricaSedi().catch(e => this.avvisi.errore(e));
  }

  protected scegli(s: Sede): void {
    this.sede.scegli(s.id);
    void this.registro.registra('Scelta sede', s.nome);
    void this.router.navigateByUrl('/dashboard');
  }
}
