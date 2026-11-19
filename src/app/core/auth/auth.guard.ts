import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { localBackend } from '../local-backend/local-api';

/**
 * Guard funcional que protege rotas autenticadas.
 * Aguarda a reidratação da sessão (evita deslogar em reload/acesso direto) e
 * redireciona para `/auth` quando não há sessão ativa.
 *
 * DESKTOP (ADR-033): no Electron o app é local-only, sem login — libera sempre.
 */
export const authGuard: CanActivateFn = async () => {
  if (localBackend()) {
    return true;
  }
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ensureHydrated();
  if (auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/auth']);
};
