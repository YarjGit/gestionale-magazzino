import type { Routes } from '@angular/router';

// Le schermate si aggiungono qui una alla volta (MIGRAZIONE.md). Quelle con dati useranno authGuard e sedeGuard
// (core/guards/guards.ts) e il caricamento pigro: loadComponent: () => import('./features/…').then(m => m.…).
export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/avvio/avvio').then(m => m.Avvio) },
  { path: '**', redirectTo: '' }
];
