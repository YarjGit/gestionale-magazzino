import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { RegistroService } from '../../core/services/registro.service';

/** Accesso (prototipo/login.html): email + password, oppure link via email la prima volta o se la password è dimenticata. */
@Component({
  selector: 'app-accesso',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="accesso-pagina">
      <form class="accesso-card" (ngSubmit)="entra()">
        <div class="accesso-logo"><img src="favicon.png" alt=""></div>
        <h1>Gestionale Magazzino</h1>
        <p class="sotto">Accedi per gestire giacenze, carichi e trasferimenti</p>
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="username" placeholder="nome@esempio.it" [(ngModel)]="email" required>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" placeholder="La tua password" [(ngModel)]="password">
        <button class="btn btn-primary entra" type="submit" [disabled]="occupato()">{{ occupato() ? 'Accesso…' : 'Entra' }}</button>
        <button class="btn btn-light link" type="button" [disabled]="occupato()" (click)="inviaLink()">Prima volta o password dimenticata? Ricevi un link via email</button>
        @if (esito(); as e) { <div class="esito" [class.errore]="e.errore">{{ e.testo }}</div> }
      </form>
    </div>
  `,
  styles: `
    .accesso-pagina { min-height: 100vh; display: grid; place-items: center; padding: 16px;
      background: linear-gradient(160deg, #bfeff3, #4fb5c4 60%, #155e6e); }
    .accesso-card { width: min(400px, 100%); display: flex; flex-direction: column; gap: 6px; padding: 28px; border-radius: 16px;
      background: rgba(255,255,255,0.92); box-shadow: 0 20px 50px rgba(10,40,60,0.25); }
    .accesso-logo { display: grid; place-items: center; margin-bottom: 4px; }
    .accesso-logo img { width: 56px; height: 56px; }
    h1 { text-align: center; font-size: 1.3rem; }
    .sotto { text-align: center; color: var(--muted); margin-bottom: 10px; }
    label { font-weight: 600; font-size: 0.82rem; margin-top: 6px; }
    input { padding: 10px 12px; border: 1px solid var(--line); border-radius: 9px; background: #fff; }
    .entra { margin-top: 12px; justify-content: center; padding: 11px; }
    .link { justify-content: center; font-size: 0.82rem; }
    .esito { margin-top: 10px; padding: 10px 12px; border-radius: 9px; background: #effaf3; color: #13804a; font-size: 0.88rem; }
    .esito.errore { background: #fde4e4; color: #8a1c1c; }
  `
})
export class Accesso implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly registro = inject(RegistroService);
  protected email = '';
  protected password = '';
  protected readonly occupato = signal(false);
  protected readonly esito = signal<{ testo: string; errore: boolean } | null>(null);

  async ngOnInit(): Promise<void> {
    // link scaduto o già usato: Supabase torna qui con l'errore nell'indirizzo
    const err = new URLSearchParams(location.hash.slice(1)).get('error_description');
    if (err) this.esito.set({ testo: `Il link non è più valido (${err.replace(/\+/g, ' ')}). Chiedine uno nuovo qui sotto.`, errore: true });
    await this.auth.pronto();
    if (this.auth.connesso()) void this.router.navigateByUrl('/dashboard');   // già dentro
  }

  protected async entra(): Promise<void> {
    if (!this.password) {
      this.esito.set({ testo: 'Scrivi la password. Se è la prima volta o non la ricordi, usa il link qui sotto.', errore: true });
      return;
    }
    this.occupato.set(true);
    try {
      sessionStorage.removeItem('sede');
      await this.auth.accediConPassword(this.email, this.password);
      void this.registro.registra('Accesso');
      void this.router.navigateByUrl('/dashboard');
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      this.esito.set({
        testo: /invalid/i.test(m) ? 'Email o password non corrette. Se non hai ancora una password, usa il link qui sotto.' : `Accesso non riuscito: ${m}`,
        errore: true
      });
    } finally {
      this.occupato.set(false);
    }
  }

  protected async inviaLink(): Promise<void> {
    const email = this.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { this.esito.set({ testo: 'Scrivi prima la tua email.', errore: true }); return; }
    this.occupato.set(true);
    try {
      sessionStorage.removeItem('sede');
      await this.auth.inviaLinkAccesso(email);
      this.esito.set({ testo: `✉️ Ti abbiamo inviato un link a ${email}. Aprilo in questo browser e sarai dentro (controlla anche lo spam).`, errore: false });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      this.esito.set({
        testo: /rate|limit|seconds/i.test(m) ? 'Hai chiesto troppi link in poco tempo: aspetta qualche minuto e riprova.' : `Non è stato possibile inviare il link: ${m}`,
        errore: true
      });
    } finally {
      this.occupato.set(false);
    }
  }
}
