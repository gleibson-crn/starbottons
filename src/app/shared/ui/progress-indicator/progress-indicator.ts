import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * ProgressIndicator — barra de progresso acessível (`role=progressbar`).
 * `value` nulo = indeterminado (anima faixa). Sempre acompanha rótulo textual.
 * Respeita `prefers-reduced-motion` via tokens globais.
 */
@Component({
  selector: 'app-progress-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './progress-indicator.html',
  styleUrl: './progress-indicator.scss',
})
export class ProgressIndicator {
  /** 0–100, ou `null` para indeterminado. */
  readonly value = input<number | null>(null);
  /** Rótulo acessível do progresso. */
  readonly label = input<string>('Processando');

  get clamped(): number {
    const v = this.value() ?? 0;
    return Math.max(0, Math.min(100, Math.round(v)));
  }

  get indeterminate(): boolean {
    return this.value() === null;
  }
}
