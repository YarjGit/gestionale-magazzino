import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { Sede } from '../../core/models/database.types';
import { ElencoAnagrafica, type ConfigAnagrafica } from '../../shared/elenco-anagrafica';

/**
 * Sedi (prototipo/sedi.html, lì con dati di esempio): dalla tabella sedi, stesso elenco del tasto colorato in alto.
 * Per ora solo lettura: attivare una sede o cambiarne il colore si deciderà insieme (servirà una funzione del database).
 */
@Component({
  selector: 'app-sedi',
  imports: [ElencoAnagrafica],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-elenco-anagrafica [config]="config" [apribile]="false" />`
})
export class Sedi {
  protected readonly config: ConfigAnagrafica<Sede> = {
    titolo: 'Sedi', sezione: 'Setup', tabella: 'sedi', csv: 'sedi',
    select: '*', cercaIn: ['nome', 'citta', 'indirizzo', 'codice', 'email'],
    ordine: { colonna: 'attiva', crescente: false },
    schede: [
      { k: 'att', t: 'Attive', colore: '#18a058', condizioni: ['attiva.is.true'] },
      { k: 'neg', t: 'Negozi CAL', colore: '#d4009c', condizioni: ['gruppo.eq.Negozi CAL'] },
      { k: 'lab', t: 'Laboratori e magazzino', colore: '#990000', condizioni: ['gruppo.eq.Laboratori e magazzino'] },
      { k: 'altri', t: 'Altri punti vendita', colore: '#94a3b8', condizioni: ['gruppo.eq.Altri punti vendita'] }
    ],
    colonne: [
      { t: 'Stato', valore: r => (r.attiva ? '● Attiva' : '○ Spenta'), ordina: 'attiva',
        pill: r => (r.attiva ? { sfondo: '#ddf5e8', testo: 'var(--ok)' } : { sfondo: '#f1f3f7', testo: '#8a94a6' }) },
      { t: 'Nome', valore: r => r.nome, ordina: 'nome', pallino: r => r.colore ?? '#dfe4ec' },
      { t: 'Gruppo', valore: r => r.gruppo, ordina: 'gruppo' },
      { t: 'Città', valore: r => r.citta ?? '', ordina: 'citta', larg: 120 },
      { t: 'Indirizzo', valore: r => r.indirizzo ?? '', larg: 180 },
      { t: 'Email', valore: r => r.email ?? '', larg: 200 },
      { t: 'Codice', valore: r => r.codice ?? '', ordina: 'codice' }
    ]
  };
}
