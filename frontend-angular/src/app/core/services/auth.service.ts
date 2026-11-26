import { computed, inject, Injectable, Injector, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Session } from '@supabase/supabase-js';
import { ErroreDatabase, SupabaseService } from './supabase.service';
import { anteprimaAttiva, SESSIONE_FINTA } from '../anteprima/anteprima';

/**
 * Sessione e autorizzazione (come il prototipo: login.html e layout.js).
 * Accesso con email + password oppure link via email (signInWithOtp); poi il database dice se l'utente
 * è in `utenti_autorizzati` e non è bloccato (RPC e_autorizzato), e se è amministratore (e_amministratore).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly injector = inject(Injector);

  readonly sessione = signal<Session | null>(null);
  /** null = non ancora verificato. */
  readonly autorizzato = signal<boolean | null>(null);
  readonly amministratore = signal(false);
  readonly email = computed(() => this.sessione()?.user.email ?? null);
  readonly connesso = computed(() => this.sessione() !== null);

  private readonly avvio: Promise<void>;

  constructor() {
    this.avvio = this.inizializza();
    this.supabase.client.auth.onAuthStateChange((evento, sessione) => {
      if (anteprimaAttiva()) return;
      const eraDentro = this.sessione() !== null;
      this.sessione.set(sessione);
      if (!sessione) {
        this.autorizzato.set(null);
        this.amministratore.set(false);
        // sessione scaduta da sola (non "Esci"): si torna all'accesso con la spiegazione. Se si sta modificando una scheda
        // non la si chiude: chi rientra in un'altra scheda del browser ritrova la sessione anche qui e può salvare.
        if (evento === 'SIGNED_OUT' && eraDentro && !this.uscitaVoluta) setTimeout(() => this.sessioneScaduta());
      }
      this.uscitaVoluta = false;
    });
  }

  private uscitaVoluta = false;

  private sessioneScaduta(): void {
    const router = this.injector.get(Router);
    if (document.body.dataset['modifica'] === '1') {
      alert("La sessione è scaduta. Le modifiche di questa scheda NON sono perse: apri un'altra scheda del browser, entra di nuovo nel gestionale, poi torna qui e premi Salva.");
      return;
    }
    void router.navigate(['/accesso'], { queryParams: { scaduta: 1 } });
  }

  /** Attende che la sessione salvata sia stata letta (da usare nelle guard). */
  pronto(): Promise<void> {
    return this.avvio;
  }

  private async inizializza(): Promise<void> {
    if (anteprimaAttiva()) {   // solo sviluppo: utente finto già dentro
      this.sessione.set(SESSIONE_FINTA as unknown as Session);
      this.autorizzato.set(true);
      this.amministratore.set(true);
      return;
    }
    const { data } = await this.supabase.client.auth.getSession();
    this.sessione.set(data.session);
    if (data.session) await this.verificaAutorizzazione();
  }

  async verificaAutorizzazione(): Promise<boolean> {
    try {
      const [ok, admin] = await Promise.all([
        this.supabase.rpc('e_autorizzato', {}),
        this.supabase.rpc('e_amministratore', {}).catch(() => false)
      ]);
      this.autorizzato.set(ok === true);
      this.amministratore.set(admin === true);
      return ok === true;
    } catch {
      this.autorizzato.set(false);
      return false;
    }
  }

  async accediConPassword(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw new ErroreDatabase(error);
    await this.verificaAutorizzazione();
  }

  /** Link di accesso via email: riporta a questa app (indirizzo da aggiungere ai Redirect URLs di Supabase). */
  async inviaLinkAccesso(email: string): Promise<void> {
    const { error } = await this.supabase.client.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: document.baseURI }   // indirizzo della app (anche se pubblicata in una sottocartella)
    });
    if (error) throw new ErroreDatabase(error);
  }

  async esci(): Promise<void> {
    this.uscitaVoluta = true;
    await this.supabase.client.auth.signOut();
  }
}
