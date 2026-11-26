import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { AliquotaIva } from '../../core/models/database.types';
import { toNumber } from '../../core/models/database.types';
import { ElencoAnagrafica, type ConfigAnagrafica } from '../../shared/elenco-anagrafica';

/**
 * Aliquote IVA (prototipo/aliquote-iva.html): le 12 aliquote del gestionale attuale, dalla tabella aliquote_iva.
 * Solo lettura: negli articoli si usano 22%, 4% (ostie) e 0% (libri); le altre servono ai documenti del commercialista.
 */
@Component({
  selector: 'app-aliquote-iva',
  imports: [ElencoAnagrafica],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-elenco-anagrafica [config]="config" [apribile]="false" />`
})
export class AliquoteIva {
  protected readonly config: ConfigAnagrafica<AliquotaIva> = {
    titolo: 'Aliquote IVA', sezione: 'Configurazione', tabella: 'aliquote_iva', csv: 'aliquote-iva',
    select: 'codice, descrizione, aliquota, applicazione', cercaIn: ['codice', 'descrizione'],
    ordine: { colonna: 'codice', crescente: true },
    schede: [
      { k: 'imp', t: 'Imponibili', colore: '#2f8bff', condizioni: ['aliquota.gt.0'] },
      { k: 'zero', t: 'Esenti / N.I.', colore: '#18a058', condizioni: ['aliquota.eq.0'] }
    ],
    colonne: [
      { t: 'Codice', valore: r => r.codice, ordina: 'codice', link: true },
      { t: 'Descrizione', valore: r => r.descrizione, ordina: 'descrizione', larg: 320 },
      { t: 'Aliquota', valore: r => `${toNumber(r.aliquota)}%`, ordina: 'aliquota', num: true,
        pill: r => (toNumber(r.aliquota) ? { sfondo: '#e8f1ff', testo: '#1f5fbf' } : { sfondo: '#ddf5e8', testo: 'var(--ok)' }) },
      { t: 'Applicazione IVA', valore: r => r.applicazione ?? '', pill: r => (r.applicazione ? { sfondo: '#f1f3f7', testo: '#4a5568' } : null) }
    ]
  };
}
