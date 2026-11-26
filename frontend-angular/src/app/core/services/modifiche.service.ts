import { Injectable, signal } from '@angular/core';

/**
 * "Sto creando o modificando qualcosa" (come body.in-modifica nel prototipo).
 * Le schede movimento/articolo lo accendono mentre si lavora; il menu allora chiede se aprire la voce in una scheda
 * nuova, andarci lasciando le modifiche o restare; il browser chiede conferma prima di chiudere la scheda.
 */
@Injectable({ providedIn: 'root' })
export class ModificheService {
  readonly attive = signal(false);

  constructor() {
    window.addEventListener('beforeunload', e => {
      if (!this.attive()) return;
      e.preventDefault();
    });
  }

  imposta(attive: boolean): void {
    this.attive.set(attive);
    // letto da AuthService se la sessione scade mentre si modifica (per non perdere il lavoro)
    if (attive) document.body.dataset['modifica'] = '1'; else delete document.body.dataset['modifica'];
  }
}
