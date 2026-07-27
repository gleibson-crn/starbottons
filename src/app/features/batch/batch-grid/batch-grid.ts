import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FileDropzone, ToastService, type RejectedFile } from '../../../shared/ui';
import { BatchStore, ZipExportService, type BottonSize } from '../../../core/batch';
import { BatchProgress } from '../batch-progress/batch-progress';
import { BatchImageCard } from '../batch-image-card/batch-image-card';
import type { BatchEditResult } from '../batch-editor-dialog/batch-editor-dialog';

/**
 * BatchGrid — página do LOTE. Toolbar (progresso + ações), FileDropzone múltiplo
 * e a grade de cartões. Reusa o BatchStore para todo o estado. Uma região
 * `aria-live=polite` anuncia o progresso agregado a leitores de tela.
 */
@Component({
  selector: 'app-batch-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FileDropzone,
    BatchProgress,
    BatchImageCard,
  ],
  templateUrl: './batch-grid.html',
  styleUrl: './batch-grid.scss',
})
export class BatchGrid {
  readonly store = inject(BatchStore);
  private readonly zip = inject(ZipExportService);
  private readonly toast = inject(ToastService);

  readonly items = this.store.items;
  readonly totalArtes = this.store.totalArtes;
  readonly artesProntas = this.store.artesProntas;
  readonly artesGerando = this.store.artesGerando;
  readonly artesFalhas = this.store.artesFalhas;
  readonly podeGerar = this.store.podeGerar;
  readonly generating = this.store.generating;
  readonly capped = this.store.capped;
  readonly nameMissing = this.store.nameMissing;
  readonly remaining = this.store.remainingArtes;
  readonly itemsSemTamanho = this.store.itemsSemTamanho;
  readonly itemsBloqueadosSemTamanho = this.store.itemsBloqueadosSemTamanho;
  readonly zipping = signal(false);

  readonly hasItems = computed(() => this.items().length > 0);
  readonly hasReady = computed(() => this.artesProntas() > 0);
  readonly liveStatus = computed(
    () => `${this.artesProntas()} de ${this.totalArtes()} artes prontas`,
  );

  onFilesAccepted(files: File[]): void {
    for (const reason of this.store.addFiles(files)) {
      this.toast.warning(reason);
    }
  }

  onFilesRejected(list: RejectedFile[]): void {
    for (const item of list) {
      this.toast.error(`${item.name}: ${item.reason}`);
    }
  }

  generate(): void {
    void this.store.generateAll();
  }

  cancel(): void {
    this.store.cancel();
  }

  async downloadZip(): Promise<void> {
    if (this.zipping()) {
      return;
    }
    this.zipping.set(true);
    try {
      const result = await this.zip.export(this.store.items());
      this.reportZip(result.zipped, result.skippedFailures);
    } catch (err) {
      this.toast.error((err as Error).message);
    } finally {
      this.zipping.set(false);
    }
  }

  onToggle(id: string, size: BottonSize): void {
    this.store.toggleSize(id, size);
  }

  onRemove(id: string): void {
    this.store.removeItem(id);
  }

  onName(id: string, name: string): void {
    this.store.setName(id, name);
  }

  onTransform(id: string, result: BatchEditResult): void {
    this.store.setTransform(id, result.transform, result.editorSide);
    this.store.setItemFilters(id, result.filters);
  }

  onRetry(id: string): void {
    void this.store.retryItem(id);
  }

  private reportZip(zipped: number, skipped: number): void {
    if (zipped === 0) {
      this.toast.error('Nenhuma arte pronta para baixar.');
      return;
    }
    this.toast.success(`ZIP com ${zipped} arquivo(s) gerado.`);
    if (skipped > 0) {
      this.toast.warning(`${skipped} arte(s) com falha ficaram de fora do ZIP.`);
    }
  }
}
