import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { RegistroAttivita } from '../../core/models/database.types';
import { SedeService } from '../../core/services/sede.service';
import { ElencoAnagrafica, type ConfigAnagrafica } from '../../shared/elenco-anagrafica';

/** attività → [sfondo, colore, icona, gruppo] (prototipo/attivita-utenti.html) */
const STILE: Record<string, [string, string, string, string]> = {
  'Accesso': ['#ddf5e8', 'var(--ok)', '→', 'acc'], 'Uscita': ['#f1f3f7', '#64748b', '←', 'acc'], 'Scelta sede': ['#eef2f7', '#475569', '⌂', 'acc'],
  'Nuovo movimento': ['#e8f1ff', '#1f5fbf', '+', 'mov'], 'Modifica movimento': ['#fff3dd', '#b26a00', '✎', 'mov'], 'Cambio stato': ['#fff3dd', '#b26a00', '⇄', 'mov'],
  'Conferma ricevuto': ['#ddf5e8', 'var(--ok)', '✔', 'mov'], 'Movimento eliminato': ['#fde4e4', 'var(--ko)', '✕', 'mov'],
  'Nuovo articolo': ['#e8f1ff', '#1f5fbf', '+', 'ana'], 'Modifica articolo': ['#fff3dd', '#b26a00', '✎', 'ana'], 'Articolo eliminato': ['#fde4e4', 'var(--ko)', '✕', 'ana'],
  'Nuovo fornitore': ['#e8f1ff', '#1f5fbf', '+', 'ana'], 'Modifica fornitore': ['#fff3dd', '#b26a00', '✎', 'ana'], 'Fornitore eliminato': ['#fde4e4', 'var(--ko)', '✕', 'ana'],
  'Fornitore aggiunto alla sede': ['#e8f1ff', '#1f5fbf', '+', 'ana'], 'Fornitore tolto dalla sede': ['#fde4e4', 'var(--ko)', '−', 'ana'],
  'Nuovo cliente': ['#e8f1ff', '#1f5fbf', '+', 'ana'], 'Modifica cliente': ['#fff3dd', '#b26a00', '✎', 'ana'], 'Cliente eliminato': ['#fde4e4', 'var(--ko)', '✕', 'ana'],
  'Utente autorizzato': ['#f3e8ff', '#7c3aed', '+', 'ana'], 'Modifica utente': ['#f3e8ff', '#7c3aed', '✎', 'ana'], 'Utente tolto': ['#fde4e4', 'var(--ko)', '✕', 'ana'],
  'Stampa etichette': ['#f3e8ff', '#7c3aed', '🏷', 'sta'], 'Stampa DDT': ['#f3e8ff', '#7c3aed', '🚚', 'sta'], 'Esporta Excel': ['#e6f6ec', '#13804a', '⤓', 'sta']
};
const stile = (a: string): [string, string, string, string] => STILE[a] ?? ['#f1f3f7', '#475569', '•', 'altro'];
/** condizione PostgREST "attivita in (…)" per una scheda */
const gruppo = (g: string): string[] => [`attivita.in.(${Object.entries(STILE).filter(([, v]) => v[3] === g).map(([k]) => `"${k}"`).join(',')})`];
const NOMI_TIPO: Record<string, string> = { riallineamento: 'Inventario', diminuzione_giacenza: 'Diminuzione giacenza', carico_fornitore: 'Carico da fornitore', ordine_fornitore: 'Ordine a fornitore',
  trasferimento_a_filiale: 'Trasferimento a filiale', vendite_giornaliere: 'Vendite giornaliere', aumento_giacenza: 'Aumento giacenza', ordine_cliente: 'Ordine da cliente',
  scarico_cliente: 'Scarico a cliente', esistenza: 'Giacenza iniziale' };

/**
 * Attività Utenti (prototipo/attivita-utenti.html): registro di chi entra e cosa fa (registro_attivita, solo lettura e aggiunta).
 * Le modifiche ai dati le annota il database; accessi, uscite, scelta sede, stampe ed Excel la pagina. Una pagina alla volta.
 */
@Component({
  selector: 'app-attivita-utenti',
  imports: [ElencoAnagrafica],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-elenco-anagrafica [config]="config" [apribile]="false" />`
})
export class AttivitaUtenti {
  private readonly sede = inject(SedeService);
  private readonly nomeSede = (s: string | null): string => this.sede.sedi().find(x => x.id === s)?.nome ?? s ?? '';
  protected readonly config: ConfigAnagrafica<RegistroAttivita> = {
    titolo: 'Attività Utenti', sezione: 'Setup', tabella: 'registro_attivita', csv: 'attivita-utenti', select: '*',
    cercaIn: ['email', 'attivita', 'dettagli', 'sede'], ordine: { colonna: 'quando', crescente: false },
    filtri: [{ k: 'attivita', label: 'Attività', colonna: 'attivita', opzioni: Object.keys(STILE) }],
    schede: [
      { k: 'acc', t: 'Accessi', colore: '#18a058', condizioni: gruppo('acc') },
      { k: 'mov', t: 'Movimenti', colore: '#2f8bff', condizioni: gruppo('mov') },
      { k: 'ana', t: 'Anagrafiche', colore: '#b26a00', condizioni: gruppo('ana') },
      { k: 'sta', t: 'Stampe ed Excel', colore: '#7c3aed', condizioni: gruppo('sta') }
    ],
    colonne: [
      { t: 'Quando', valore: r => { const d = new Date(r.quando); return `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`; }, ordina: 'quando' },
      { t: 'Utente (mail di accesso)', valore: r => r.email ?? '—', ordina: 'email', larg: 260 },
      { t: 'Sede', valore: r => this.nomeSede(r.sede), ordina: 'sede' },
      { t: 'Attività', valore: r => `${stile(r.attivita)[2]} ${r.attivita}`, ordina: 'attivita', pill: r => ({ sfondo: stile(r.attivita)[0], testo: stile(r.attivita)[1] }) },
      { t: 'Dettagli', larg: 380, valore: r => {
        const m = r.tabella === 'movimenti' ? /^(\w+) #(\d+)/.exec(r.dettagli ?? '') : null;
        return m ? (r.dettagli ?? '').replace(`${m[1]} #${m[2]}`, `${NOMI_TIPO[m[1]] ?? m[1]} #${m[2]}`) : r.dettagli ?? '';
      } },
      { t: 'Dispositivo', valore: r => r.dispositivo ?? '', larg: 200 }
    ],
    vuoto: 'Le attività compariranno qui man mano che le persone usano il gestionale.'
  };
  constructor() { void this.sede.caricaSedi(); }
}
