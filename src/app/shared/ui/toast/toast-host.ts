import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

/**
 * ToastHost — região viva (`aria-live=polite`, `role=status`) que anuncia
 * mensagens transitórias. Cada toast usa ícone + texto (nunca só cor) e
 * botão de fechar com alvo ≥44px. Estados: success/error/warning/info.
 */
@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './toast-host.html',
  styleUrl: './toast-host.scss',
})
export class ToastHost {
  private readonly service = inject(ToastService);
  readonly toasts = this.service.toasts;

  readonly icon: Record<string, string> = {
    success: '✓',
    error: '✕',
    warning: '!',
    info: 'i',
  };

  dismiss(id: number): void {
    this.service.dismiss(id);
  }
}
