import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ModificheService } from '../services/modifiche.service';
import { RegistroService } from '../services/registro.service';
import { SedeService } from '../services/sede.service';
import { AvvisiService } from '../../shared/avvisi.service';
import { coloreTesto } from '../../shared/formato';
import type { Sede } from '../models/database.types';
import { ICONE, MENU, type SezioneMenu, type VoceMenu } from './menu';

/** Ossatura di tutte le pagine interne: menu laterale, barra in alto con la sede, menu utente, avvisi (prototipo/js/layout.js). */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html'
})
export class Shell {
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly auth = inject(AuthService);
  protected readonly sede = inject(SedeService);
  protected readonly avvisi = inject(AvvisiService);
  private readonly modifiche = inject(ModificheService);
  private readonly registro = inject(RegistroService);

  protected readonly menu = MENU;
  protected readonly icone: Record<string, SafeHtml> = Object.fromEntries(
    Object.entries(ICONE).map(([k, v]) => [k, this.sanitizer.bypassSecurityTrustHtml(v)])
  );
  protected readonly url = toSignal(this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(() => this.router.url)), { initialValue: this.router.url });
  protected readonly aperte = signal<Set<string>>(new Set());
  protected readonly mini = signal(false);
  protected readonly menuMobile = signal(false);
  protected readonly menuSedi = signal(false);
  protected readonly menuUtente = signal(false);
  protected readonly cercaSede = signal('');
  protected readonly chiedi = signal<VoceMenu | null>(null);

  protected readonly nomeUtente = computed(() => (this.auth.email() ?? '').split('@')[0].replace(/[._-]+/g, ' '));
  protected readonly iniziali = computed(() => this.nomeUtente().split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase() || '?');
  protected readonly coloreSede = computed(() => this.sede.sede()?.colore ?? '#f1f3f7');
  protected readonly testoSede = computed(() => coloreTesto(this.sede.sede()?.colore));
  protected readonly sediFiltrate = computed(() => {
    const f = this.cercaSede().toLowerCase();
    return this.sede.sedi().filter(s => s.nome.toLowerCase().includes(f));
  });
  protected readonly coloreTesto = coloreTesto;

  constructor() {
    void this.sede.caricaSedi().catch(e => this.avvisi.errore(e));
    // stesse classi del prototipo sul body: menu ridotto e menu aperto sul telefono
    effect(() => document.body.classList.toggle('mini', this.mini()));
    effect(() => document.body.classList.toggle('side-open', this.menuMobile()));
  }

  protected testo(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected attiva(route: string | undefined): boolean {
    return !!route && (this.url() === route || this.url().startsWith(route + '/') || this.url().startsWith(route + '?'));
  }
  protected sezioneAperta(s: SezioneMenu): boolean {
    return this.aperte().has(s.id) || !!s.gruppi?.some(g => g.voci.some(v => this.attiva(v.route)));
  }
  protected apriChiudi(s: SezioneMenu): void {
    const n = new Set(this.aperte());
    if (n.has(s.id)) n.delete(s.id); else n.add(s.id);
    this.aperte.set(n);
  }

  /** Voce del menu: stessa scheda; se si sta modificando qualcosa si chiede (come il prototipo). */
  protected vai(v: VoceMenu, e: MouseEvent): void {
    e.preventDefault();
    if (v.futuro) { this.avvisi.mostra(v.futuro); return; }
    if (v.inArrivo || !v.route) { this.avvisi.mostra(`${v.label}: nel gestionale attuale è ancora solo grafica, si farà più avanti`); return; }
    if (e.ctrlKey || e.metaKey) { window.open(this.router.serializeUrl(this.router.createUrlTree([v.route])), '_blank'); return; }
    if (this.modifiche.attive()) { this.chiedi.set(v); return; }
    this.menuMobile.set(false);
    void this.router.navigateByUrl(v.route);
  }
  protected sceltaModifiche(scelta: 'nuova' | 'vai' | 'resta'): void {
    const v = this.chiedi();
    this.chiedi.set(null);
    if (!v?.route) return;
    if (scelta === 'nuova') window.open(this.router.serializeUrl(this.router.createUrlTree([v.route])), '_blank');
    if (scelta === 'vai') { this.modifiche.imposta(false); void this.router.navigateByUrl(v.route); }
  }

  /** Cambiare sede è come entrare in quella sede da capo: si parte dalla sua Dashboard. */
  protected async scegliSede(s: Sede): Promise<void> {
    if (!s.attiva) return;
    this.menuSedi.set(false);
    if (s.id === this.sede.sedeId()) return;
    if (this.modifiche.attive() && !confirm(`Stai modificando una scheda di ${this.sede.sede()?.nome ?? ''}.\nCambiando sede le modifiche non salvate si perdono.\n\nCambiare sede lo stesso?`)) return;
    this.modifiche.imposta(false);
    this.sede.scegli(s.id);
    void this.registro.registra('Scelta sede', s.nome);
    await this.router.navigateByUrl('/caricamento', { skipLocationChange: true });
    await this.router.navigateByUrl('/dashboard');
  }

  protected async esci(): Promise<void> {
    await this.registro.registra('Uscita');
    await this.auth.esci();
    void this.router.navigateByUrl('/accesso');
  }
}
