import type { Routes } from '@angular/router';
import { authGuard, sedeGuard } from './core/guards/guards';
import { Shell } from './core/layout/shell';

// Schermate migrate (MIGRAZIONE.md). Le pagine interne stanno dentro l'ossatura (Shell) e richiedono accesso e sede.
export const routes: Routes = [
  { path: 'accesso', loadComponent: () => import('./features/accesso/accesso').then(m => m.Accesso) },
  { path: 'non-autorizzato', loadComponent: () => import('./features/accesso/non-autorizzato').then(m => m.NonAutorizzato) },
  { path: 'scegli-sede', canActivate: [authGuard], loadComponent: () => import('./features/accesso/scegli-sede').then(m => m.ScegliSede) },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard, sedeGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'caricamento', loadComponent: () => import('./features/vuota').then(m => m.Vuota) },
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard) },
      { path: 'articoli', loadComponent: () => import('./features/articoli/elenco-articoli').then(m => m.ElencoArticoli) },
      { path: 'articoli/nuovo', loadComponent: () => import('./features/articoli/scheda-articolo').then(m => m.SchedaArticolo) },
      { path: 'articoli/:codice', loadComponent: () => import('./features/articoli/scheda-articolo').then(m => m.SchedaArticolo) },
      { path: 'giacenze', loadComponent: () => import('./features/giacenze/giacenze').then(m => m.Giacenze) },
      { path: 'movimenti/carichi-fornitori', loadComponent: () => import('./features/movimenti/elenchi').then(m => m.CarichiFornitori) },
      { path: 'movimenti/ordini-fornitori', loadComponent: () => import('./features/movimenti/elenchi').then(m => m.OrdiniFornitori) },
      { path: 'movimenti/vendite-giornaliere', loadComponent: () => import('./features/movimenti/elenchi').then(m => m.VenditeGiornaliere) },
      { path: 'movimenti/aumento-giacenza', loadComponent: () => import('./features/movimenti/elenchi').then(m => m.AumentoGiacenza) },
      { path: 'movimenti/diminuzione-giacenza', loadComponent: () => import('./features/movimenti/elenchi').then(m => m.DiminuzioneGiacenza) },
      { path: 'movimenti/scarichi-clienti', loadComponent: () => import('./features/movimenti/elenchi').then(m => m.ScarichiClienti) },
      { path: 'movimenti/ordini-clienti', loadComponent: () => import('./features/movimenti/elenchi').then(m => m.OrdiniClienti) },
      { path: 'movimenti/tutti', loadComponent: () => import('./features/movimenti/elenchi').then(m => m.TuttiMovimenti) },
      { path: 'trasferimenti/a-filiali', loadComponent: () => import('./features/movimenti/elenchi').then(m => m.TrasferimentiAFiliali) },
      { path: 'trasferimenti/da-filiali', loadComponent: () => import('./features/movimenti/elenchi').then(m => m.TrasferimentiDaFiliali) },
      { path: 'inventario', loadComponent: () => import('./features/movimenti/elenchi').then(m => m.Riallineamenti) },
      { path: 'carico/:id', loadComponent: () => import('./features/movimenti/carico').then(m => m.Carico) },
      { path: 'ordine/:id', loadComponent: () => import('./features/movimenti/ordine').then(m => m.Ordine) },
      { path: 'vendita/:id', loadComponent: () => import('./features/movimenti/vendita').then(m => m.Vendita) },
      { path: 'trasferimento/:id', loadComponent: () => import('./features/movimenti/trasferimento').then(m => m.Trasferimento) },
      { path: 'anagrafiche/fornitori', loadComponent: () => import('./features/anagrafiche/fornitori').then(m => m.Fornitori) },
      { path: 'anagrafiche/fornitori/nuovo', loadComponent: () => import('./features/anagrafiche/scheda-fornitore').then(m => m.SchedaFornitore) },
      { path: 'anagrafiche/fornitori/:codice', loadComponent: () => import('./features/anagrafiche/scheda-fornitore').then(m => m.SchedaFornitore) },
      { path: 'anagrafiche/clienti', loadComponent: () => import('./features/anagrafiche/clienti').then(m => m.Clienti) },
      { path: 'anagrafiche/aliquote-iva', loadComponent: () => import('./features/anagrafiche/aliquote-iva').then(m => m.AliquoteIva) },
      { path: 'setup/sedi', loadComponent: () => import('./features/anagrafiche/sedi').then(m => m.Sedi) }
    ]
  },
  { path: '**', redirectTo: '' }
];
