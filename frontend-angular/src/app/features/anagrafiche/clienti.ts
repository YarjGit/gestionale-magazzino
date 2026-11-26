import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import type { Cliente } from '../../core/models/database.types';
import { SupabaseService } from '../../core/services/supabase.service';
import { AvvisiService } from '../../shared/avvisi.service';
import { ElencoAnagrafica, type ConfigAnagrafica } from '../../shared/elenco-anagrafica';

const TIPI = ['Negozio', 'Parrocchia', 'Istituto', 'Azienda', 'Ente'];
type CampoCliente = 'nome' | 'tipo' | 'codice_fiscale' | 'partita_iva' | 'email' | 'telefono' | 'indirizzo' | 'cap' | 'citta' | 'provincia' | 'nazione';
type ValoriCliente = Record<CampoCliente, string>;
const VUOTO: ValoriCliente = { nome: '', tipo: 'Negozio', codice_fiscale: '', partita_iva: '', email: '', telefono: '', indirizzo: '', cap: '', citta: '', provincia: '', nazione: 'Italia' };

/**
 * Clienti (prototipo/clienti.html, lì con dati di esempio): qui dal database, una pagina alla volta.
 * Nuovo e modifica in una finestra; si salva solo con salva_cliente (codice C00001… assegnato dal database).
 */
@Component({
  selector: 'app-clienti',
  imports: [ElencoAnagrafica],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-elenco-anagrafica #elenco [config]="config" (apri)="apri($event)" (crea)="apri(null)" />
    @if (aperto()) {
      <div class="velo" (click)="chiudi()"></div>
      <div class="finestra" role="dialog" aria-modal="true">
        <h2>{{ id() ? 'Cliente ' + codice() : 'Nuovo cliente' }}</h2>
        <div class="campi">
          <div class="f s4"><label>Nome o ragione sociale <span style="color:var(--ko)">*</span></label><input [value]="v().nome" (input)="imposta('nome', testo($event))" style="text-transform:uppercase"></div>
          <div class="f s2"><label>Tipo</label><select (change)="imposta('tipo', testo($event))">@for (t of TIPI; track t) { <option [selected]="t === v().tipo">{{ t }}</option> }</select></div>
          <div class="f s3"><label>Codice fiscale</label><input maxlength="16" style="text-transform:uppercase" [value]="v().codice_fiscale" (input)="imposta('codice_fiscale', testo($event))"></div>
          <div class="f s3"><label>Partita IVA</label><input maxlength="16" [value]="v().partita_iva" (input)="imposta('partita_iva', testo($event))"></div>
          <div class="f s3"><label>Email</label><input type="email" [value]="v().email" (input)="imposta('email', testo($event))"></div>
          <div class="f s3"><label>Telefono</label><input type="tel" [value]="v().telefono" (input)="imposta('telefono', testo($event))"></div>
          <div class="f s4"><label>Indirizzo</label><input [value]="v().indirizzo" (input)="imposta('indirizzo', testo($event))"></div>
          <div class="f s2"><label>CAP</label><input maxlength="10" [value]="v().cap" (input)="imposta('cap', testo($event))"></div>
          <div class="f s3"><label>Città</label><input [value]="v().citta" (input)="imposta('citta', testo($event))"></div>
          <div class="f s1"><label>Prov.</label><input maxlength="2" style="text-transform:uppercase" [value]="v().provincia" (input)="imposta('provincia', testo($event))"></div>
          <div class="f s2"><label>Nazione</label><input [value]="v().nazione" (input)="imposta('nazione', testo($event))"></div>
        </div>
        <div class="tasti">
          <button class="btn btn-light" (click)="chiudi()" [disabled]="salvataggio()">✕ Annulla</button>
          <button class="btn btn-primary" (click)="salva()" [disabled]="salvataggio()">💾 {{ salvataggio() ? 'Salvo…' : 'Salva' }}</button>
        </div>
      </div>
    }
  `,
  styles: `
    .velo { position: fixed; inset: 0; background: rgba(15, 23, 42, .35); z-index: 90; }
    .finestra { position: fixed; z-index: 91; top: 8vh; left: 50%; transform: translateX(-50%); width: min(680px, calc(100vw - 32px));
      max-height: 84vh; overflow: auto; background: #fff; border-radius: 14px; padding: 20px 22px; box-shadow: 0 20px 60px rgba(0,0,0,.25); }
    .finestra h2 { margin: 0 0 14px; font-size: 18px; }
    .tasti { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  `
})
export class Clienti {
  private readonly supabase = inject(SupabaseService);
  private readonly avvisi = inject(AvvisiService);
  private readonly elenco = viewChild<ElencoAnagrafica<Cliente>>('elenco');
  protected readonly TIPI = TIPI;
  protected readonly aperto = signal(false);
  protected readonly id = signal<string | null>(null);
  protected readonly codice = signal('');
  protected readonly v = signal<ValoriCliente>({ ...VUOTO });
  protected readonly salvataggio = signal(false);

  protected readonly config: ConfigAnagrafica<Cliente> = {
    titolo: 'Clienti', sezione: 'Configurazione', tabella: 'clienti', csv: 'clienti', nuovo: 'Nuovo cliente',
    select: '*', cercaIn: ['nome', 'codice', 'codice_fiscale', 'partita_iva', 'email', 'citta'],
    ordine: { colonna: 'nome', crescente: true },
    filtri: [{ k: 'tipo', label: 'Tipo cliente', colonna: 'tipo', opzioni: TIPI }],
    schede: [
      { k: 'it', t: 'Italia', colore: '#18a058', condizioni: ['nazione.is.null,nazione.ilike.italia'] },
      { k: 'estero', t: 'Estero', colore: '#7c4dff', condizioni: ['nazione.not.ilike.italia'] }
    ],
    colonne: [
      { t: 'Nome o ragione sociale', valore: r => r.nome, ordina: 'nome', link: true, larg: 260 },
      { t: 'Codice fiscale', valore: r => r.codice_fiscale ?? r.partita_iva ?? '' },
      { t: 'Tipo', valore: r => r.tipo ?? '', ordina: 'tipo', pill: r => (r.tipo ? { sfondo: '#eef2f7', testo: '#4a5568' } : null) },
      { t: 'Email', valore: r => r.email ?? '', larg: 150 },
      { t: 'Telefono', valore: r => r.telefono ?? '' },
      { t: 'Città', valore: r => r.citta ?? '', ordina: 'citta' },
      { t: 'Nazione', valore: r => r.nazione || 'Italia' },
      { t: 'Codice', valore: r => r.codice, ordina: 'codice' }
    ],
    vuoto: 'Usa "Nuovo cliente" in alto per aggiungere il primo.'
  };

  protected testo(e: Event): string { return (e.target as HTMLInputElement).value; }
  protected imposta(k: CampoCliente, val: string): void { this.v.update(x => ({ ...x, [k]: val })); }

  protected apri(c: Cliente | null): void {
    const t = (x: string | null | undefined): string => x ?? '';
    this.id.set(c?.id ?? null);
    this.codice.set(c?.codice ?? '');
    this.v.set(c ? { nome: c.nome, tipo: t(c.tipo) || 'Negozio', codice_fiscale: t(c.codice_fiscale), partita_iva: t(c.partita_iva), email: t(c.email),
      telefono: t(c.telefono), indirizzo: t(c.indirizzo), cap: t(c.cap), citta: t(c.citta), provincia: t(c.provincia), nazione: c.nazione || 'Italia' } : { ...VUOTO });
    this.aperto.set(true);
  }

  protected chiudi(): void { if (!this.salvataggio()) this.aperto.set(false); }

  protected async salva(): Promise<void> {
    if (this.salvataggio()) return;
    const v = this.v();
    const nome = v.nome.trim().toUpperCase();
    if (!nome) { this.avvisi.mostra('Scrivi il nome del cliente', true); return; }
    if (v.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) { this.avvisi.mostra("L'email non sembra giusta", true); return; }
    const n = (x: string): string | null => x.trim() || null;
    this.salvataggio.set(true);
    try {
      await this.supabase.rpc('salva_cliente', { p_id: this.id(), p_dati: {
        nome, tipo: n(v.tipo), codice_fiscale: n(v.codice_fiscale.toUpperCase()), partita_iva: n(v.partita_iva), email: n(v.email), telefono: n(v.telefono),
        indirizzo: n(v.indirizzo), cap: n(v.cap), citta: n(v.citta.toUpperCase()), provincia: n(v.provincia.toUpperCase()), nazione: n(v.nazione) ?? 'Italia' } });
      this.avvisi.mostra(`Cliente ${nome} salvato`);
      this.salvataggio.set(false);
      this.aperto.set(false);
      this.elenco()?.ricarica();
    } catch (e) {
      this.avvisi.mostra('Cliente non salvato: ' + (e instanceof Error ? e.message : String(e)), true);
      this.salvataggio.set(false);
    }
  }
}
