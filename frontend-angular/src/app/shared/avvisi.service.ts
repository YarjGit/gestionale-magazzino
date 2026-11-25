import { Injectable, signal } from '@angular/core';

export interface Avviso { testo: string; errore: boolean; id: number }

/** Avvisi in basso (come avviso() del prototipo): i rossi restano di più. */
@Injectable({ providedIn: 'root' })
export class AvvisiService {
  readonly corrente = signal<Avviso | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private n = 0;

  mostra(testo: string, errore = false): void {
    clearTimeout(this.timer);
    this.corrente.set({ testo, errore, id: ++this.n });
    this.timer = setTimeout(() => this.corrente.set(null), errore ? 6000 : 2600);
  }
  errore(e: unknown): void {
    this.mostra(e instanceof Error ? e.message : String(e), true);
  }
}
