import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

/** Entrato ma non in "utenti_autorizzati" (o bloccato): non vede nessun dato (come l'avviso del prototipo). */
@Component({
  selector: 'app-non-autorizzato',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="content" style="max-width:640px;margin:60px auto">
      <div class="avviso-accesso">⛔ L'indirizzo <b>{{ auth.email() }}</b> non è tra gli utenti autorizzati (o è bloccato):
        chiedi all'amministratore di aggiungerlo. Finché non è autorizzato, il gestionale non mostra nessun dato.</div>
      <p style="margin-top:16px"><button class="btn btn-light" (click)="esci()">Esci e accedi con un'altra email</button></p>
    </main>
  `
})
export class NonAutorizzato {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected async esci(): Promise<void> {
    await this.auth.esci();
    void this.router.navigateByUrl('/accesso');
  }
}
