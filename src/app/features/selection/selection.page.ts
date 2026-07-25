import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { WorkflowStore } from '../../core/workflow';
import { OptionCard, ToastService } from '../../shared/ui';
import {
  MODEL_OPTIONS,
  SIZE_OPTIONS,
  mmToPx,
  rovingNext,
} from '../../shared/utils';
import { PrintSpecService } from './print-spec.service';

/**
 * SelectionPage — passo 2. Dois radiogroups (modelo e tamanho) navegáveis por
 * setas; mostra px de face @300 por tamanho e carrega a `print_spec`.
 */
@Component({
  selector: 'app-selection-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OptionCard],
  templateUrl: './selection.page.html',
  styleUrl: './selection.page.scss',
})
export class SelectionPage {
  private readonly specs = inject(PrintSpecService);
  private readonly store = inject(WorkflowStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly models = MODEL_OPTIONS;
  readonly sizes = SIZE_OPTIONS;

  readonly model = signal('round');
  readonly size = signal<number | null>(this.store.sizeMm());
  readonly loading = signal(false);

  facePx(sizeMm: number): number {
    return mmToPx(sizeMm, 300);
  }

  selectModel(key: string, available: boolean): void {
    if (available) {
      this.model.set(key);
    }
  }

  selectSize(sizeMm: number): void {
    this.size.set(sizeMm);
  }

  onModelKeydown(event: KeyboardEvent, index: number): void {
    const next = rovingNext(
      this.models.length,
      index,
      event.key,
      (i) => this.models[i].available,
    );
    this.applyKeyMove(event, next, this.models[next].key, () =>
      this.model.set(this.models[next].key),
    );
  }

  onSizeKeydown(event: KeyboardEvent, index: number): void {
    const next = rovingNext(this.sizes.length, index, event.key, () => true);
    this.applyKeyMove(event, next, `size-${this.sizes[next].sizeMm}`, () =>
      this.size.set(this.sizes[next].sizeMm),
    );
  }

  async continue(): Promise<void> {
    const sizeMm = this.size();
    if (sizeMm === null || this.loading()) {
      return;
    }
    this.loading.set(true);
    try {
      const spec = await this.specs.load(this.model(), sizeMm);
      this.store.setSelection(sizeMm, spec);
      await this.router.navigate(['/app/editor']);
    } catch (err) {
      this.toast.error((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  private applyKeyMove(
    event: KeyboardEvent,
    nextIndex: number,
    domId: string,
    apply: () => void,
  ): void {
    if (nextIndex < 0) {
      return;
    }
    event.preventDefault();
    apply();
    document.getElementById(domId)?.focus();
  }
}
