import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ModalHost, ToastHost } from './shared/ui';

/**
 * Componente raiz: hospeda o `router-outlet`, a região global de toasts
 * (`aria-live`) e o host de modais (`<dialog>`), disponíveis em todas as
 * telas, inclusive login.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ToastHost, ModalHost],
  template: `
    <router-outlet />
    <app-toast-host />
    <app-modal-host />
  `,
})
export class App {}
