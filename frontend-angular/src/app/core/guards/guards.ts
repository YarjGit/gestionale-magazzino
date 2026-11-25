import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SedeService } from '../services/sede.service';

/** Serve l'accesso: senza sessione si va alla pagina di accesso, se non autorizzato alla pagina che lo spiega. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.pronto();
  if (!auth.connesso()) return router.parseUrl('/accesso');
  const ok = auth.autorizzato() ?? (await auth.verificaAutorizzazione());
  return ok ? true : router.parseUrl('/non-autorizzato');
};

/** Serve una sede di lavoro scelta (come la finestra "Da quale sede lavori oggi?" del prototipo). */
export const sedeGuard: CanActivateFn = () => {
  const sede = inject(SedeService);
  const router = inject(Router);
  return sede.sedeId() ? true : router.parseUrl('/scegli-sede');
};
