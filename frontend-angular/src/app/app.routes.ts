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
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard) }
    ]
  },
  { path: '**', redirectTo: '' }
];
