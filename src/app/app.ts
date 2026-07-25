import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHost } from './shared/ui';

/**
 * Componente raiz: hospeda o `router-outlet` e a região global de toasts
 * (`aria-live`), disponível em todas as telas, inclusive login.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ToastHost],
  template: `
    <router-outlet />
    <app-toast-host />
  `,
})
export class App {}
