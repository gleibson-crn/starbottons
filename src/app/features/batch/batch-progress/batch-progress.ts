import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ProgressIndicator } from '../../../shared/ui';

type ProgressVariant = 'neutral' | 'success' | 'warning';

/**
 * BatchProgress — envolve o ProgressIndicator com os contadores do lote.
 * O progresso é a fração de artes RESOLVIDAS (prontas + falhas): a barra enche
 * quando o processamento termina, mesmo com falhas, em vez de travar. A variante
 * (neutral/success/warning) é comunicada por texto + contadores, não só por cor
 * (WCAG 1.4.1); os contadores separam prontas × falhas.
 */
@Component({
  selector: 'app-batch-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProgressIndicator],
  templateUrl: './batch-progress.html',
  styleUrl: './batch-progress.scss',
})
export class BatchProgress {
  readonly total = input.required<number>();
  readonly ready = input<number>(0);
  readonly generating = input<number>(0);
  readonly failed = input<number>(0);

  readonly percent = computed(() => {
    const total = this.total();
    const resolved = this.ready() + this.failed();
    return total > 0 ? Math.round((resolved / total) * 100) : 0;
  });

  readonly label = computed(
    () => `${this.ready()} de ${this.total()} artes prontas`,
  );

  readonly variant = computed<ProgressVariant>(() => {
    if (this.failed() > 0) {
      return 'warning';
    }
    if (this.total() > 0 && this.ready() === this.total()) {
      return 'success';
    }
    return 'neutral';
  });
}
