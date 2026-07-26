import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { WorkflowStore } from '../../core/workflow';
import { ProgressIndicator, ToastService } from '../../shared/ui';
import { buildGenerateRequest, GenerationService } from '../../core/generation';

/**
 * ProcessingPage — passo intermediário. Dispara `generate-art`, mostra barra
 * de progresso (determinada no polling, indeterminada na espera síncrona) e
 * permite Cancelar (aborta e volta ao editor). Em falha, oferece nova tentativa.
 */
@Component({
  selector: 'app-processing-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProgressIndicator],
  templateUrl: './processing.page.html',
  styleUrl: './processing.page.scss',
})
export class ProcessingPage {
  private readonly service = inject(GenerationService);
  private readonly store = inject(WorkflowStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly progress = signal<number | null>(null);
  readonly failed = signal(false);
  private controller = new AbortController();

  constructor() {
    if (!this.store.hasUpload() || !this.store.hasSelection()) {
      void this.router.navigate(['/app/upload']);
      return;
    }
    void this.run();
  }

  cancel(): void {
    this.controller.abort();
    void this.router.navigate(['/app/editor']);
  }

  retry(): void {
    this.failed.set(false);
    this.controller = new AbortController();
    void this.run();
  }

  private async run(): Promise<void> {
    const request = this.buildRequest();
    if (!request) {
      return;
    }
    try {
      const result = await this.service.generate(request, {
        signal: this.controller.signal,
        onProgress: (pct) => this.progress.set(pct),
      });
      this.store.setResult(result);
      await this.router.navigate(['/app/result']);
    } catch (err) {
      this.failed.set(true);
      this.toast.error((err as Error).message);
    }
  }

  private buildRequest() {
    const uploadId = this.store.generationUploadId();
    const spec = this.store.spec();
    const sizeMm = this.store.sizeMm();
    if (!uploadId || !spec || sizeMm === null) {
      return null;
    }
    // Abordagem A: `uploadId` é o do upload TRATADO (se houver filtros) ou o do
    // original. A Edge e o contrato de `generate-art` permanecem inalterados.
    return buildGenerateRequest({
      uploadId,
      sizeMm,
      spec,
      transform: this.store.transform(),
      editorSide: this.store.editorSide(),
    });
  }
}
