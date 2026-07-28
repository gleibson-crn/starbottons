import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { BatchStore, hasReadyArt } from '../../core/batch';
import { ToastService } from '../../shared/ui';

/**
 * Guarda o Mockup Contextual (`/app/mockup/:itemId`): a arte é o sprite FIEL
 * renderizado a partir de uma imagem do LOTE. Só libera quando o item existe no
 * `BatchStore` E tem ≥1 arte pronta (`status === 'ready'`). Sem isso não há o
 * que aplicar — redireciona para o grid `/app/batch` e avisa por toast
 * (WCAG — feedback claro, sem tela morta).
 */
export const mockupGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const store = inject(BatchStore);
  const router = inject(Router);
  const toast = inject(ToastService);

  const itemId = route.paramMap.get('itemId');
  const item = itemId ? store.items().find((i) => i.id === itemId) : undefined;
  if (hasReadyArt(item)) {
    return true;
  }
  toast.show(
    'info',
    'Gere ao menos um tamanho desta imagem antes de aplicar em um cenário.',
  );
  return router.createUrlTree(['/app/batch']);
};
