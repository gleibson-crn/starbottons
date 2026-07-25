import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Guard funcional que protege rotas autenticadas.
 * Aguarda a reidratação da sessão (evita deslogar em reload/acesso direto) e
 * redireciona para `/auth` quando não há sessão ativa.
 */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ensureHydrated();
  if (auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/auth']);
};
