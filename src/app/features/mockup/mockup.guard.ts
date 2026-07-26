import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { WorkflowStore } from '../../core/workflow';
import { ToastService } from '../../shared/ui';

/**
 * Guarda o Mockup Contextual: a arte do botton é o sprite renderizado a partir
 * do upload + spec em memória (WorkflowStore). Sem eles não há o que aplicar,
 * então redireciona para /app/upload e avisa por toast (WCAG — feedback claro).
 */
export const mockupGuard: CanActivateFn = () => {
  const store = inject(WorkflowStore);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (store.hasUpload() && store.hasSelection()) {
    return true;
  }
  toast.show('info', 'Envie uma imagem e escolha o tamanho antes de aplicar em um cenário.');
  return router.createUrlTree(['/app/upload']);
};
