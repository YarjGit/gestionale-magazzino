import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import type { FornitoreBreve } from '../features/fornitori/fornitori-sede.service';

/** Scelta del fornitore scrivendo nome o codice (prototipo/js/cerca-fornitore.js). */
@Component({
  selector: 'app-cerca-fornitore',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cerca-forn-campo" style="position:relative">
      <input [placeholder]="vuoto() ? vuoto() + ' · scrivi nome o codice…' : 'Scrivi nome o codice del ' + cosa() + '…'" autocomplete="off"
             [value]="testo()" [disabled]="disabilitato()" (focus)="apri()" (input)="scrivi($event)" (keydown)="tasto($event)" (blur)="chiudi()">
      <div class="suggerimenti" [class.show]="aperto()">
        @for (f of trovati(); track f.id; let i = $index) {
          <div class="sugg" [class.attivo]="i === attivo()" (mousedown)="scegli(f)"><span class="codice">{{ f.codice }}</span>{{ f.nome }}</div>
        } @empty {
          <div class="sugg" style="cursor:default;color:var(--muted)">Nessun {{ cosa() }} trovato</div>
        }
      </div>
    </div>
  `
})
export class CercaFornitore {
  readonly fornitori = input.required<FornitoreBreve[]>();
  readonly valore = input<string | null>(null);
  readonly vuoto = input('');
  /** cosa si cerca, per le scritte: "fornitore" o "cliente" */
  readonly cosa = input('fornitore');
  readonly disabilitato = input(false);
  readonly cambiato = output<string | null>();

  protected readonly cercato = signal('');
  protected readonly aperto = signal(false);
  protected readonly attivo = signal(0);
  protected readonly testo = signal('');
  protected readonly trovati = computed(() => {
    const parole = this.cercato().toLowerCase().split(/\s+/).filter(Boolean);
    return this.fornitori().filter(f => parole.every(p => `${f.codice} ${f.nome}`.toLowerCase().includes(p))).slice(0, 15);
  });

  constructor() {
    effect(() => {
      const f = this.fornitori().find(x => x.id === this.valore());
      this.testo.set(f ? `${f.codice}: ${f.nome}` : '');
    });
  }

  protected apri(): void { this.cercato.set(''); this.attivo.set(0); this.aperto.set(true); }
  protected chiudi(): void {
    setTimeout(() => {
      this.aperto.set(false);
      const f = this.fornitori().find(x => x.id === this.valore());
      if (!this.testo().trim()) { if (this.valore()) this.cambiato.emit(null); }
      else this.testo.set(f ? `${f.codice}: ${f.nome}` : '');
    }, 150);
  }
  protected scrivi(e: Event): void {
    const t = (e.target as HTMLInputElement).value;
    this.testo.set(t); this.cercato.set(t); this.attivo.set(0); this.aperto.set(true);
  }
  protected tasto(e: KeyboardEvent): void {
    const l = this.trovati();
    if (e.key === 'ArrowDown') { this.attivo.set(Math.min(this.attivo() + 1, l.length - 1)); e.preventDefault(); }
    if (e.key === 'ArrowUp') { this.attivo.set(Math.max(this.attivo() - 1, 0)); e.preventDefault(); }
    if (e.key === 'Enter') { e.preventDefault(); const f = l[this.attivo()]; if (f) this.scegli(f); }
    if (e.key === 'Escape') this.aperto.set(false);
  }
  protected scegli(f: FornitoreBreve): void {
    this.aperto.set(false);
    this.testo.set(`${f.codice}: ${f.nome}`);
    this.cambiato.emit(f.id);
  }
}
