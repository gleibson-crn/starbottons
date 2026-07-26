import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { WorkflowStore } from '../../core/workflow';
import { FileDropzone, ToastService, type RejectedFile } from '../../shared/ui';
import { BatchStore } from '../../core/batch';
import type { ImageProbe } from '../../core/upload';
import { UploadService } from '../../core/upload';

/** Abaixo disto a imagem tende a ficar sem nitidez mesmo no menor botton. */
const LOW_RES_THRESHOLD = 700;

/**
 * UploadPage — passo 1. Dropzone ÚNICO que reconhece a quantidade: uma imagem
 * segue o fluxo single (probe/preview + Continuar → /app/selection); duas ou
 * mais acumulam no BatchStore e abrem o envio em lote (→ /app/batch). Mostra
 * thumb + nome + dimensões e um heads-up (não bloqueante) de baixa resolução.
 */
@Component({
  selector: 'app-upload-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FileDropzone],
  templateUrl: './upload.page.html',
  styleUrl: './upload.page.scss',
})
export class UploadPage {
  private readonly service = inject(UploadService);
  private readonly store = inject(WorkflowStore);
  private readonly batch = inject(BatchStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly file = signal<File | null>(null);
  readonly probe = signal<ImageProbe | null>(null);
  readonly uploading = signal(false);

  readonly lowRes = computed(() => {
    const p = this.probe();
    return p !== null && Math.min(p.width, p.height) < LOW_RES_THRESHOLD;
  });

  /** 1 arquivo → fluxo single; 2+ → acumula no lote e navega para /app/batch. */
  async onFilesAccepted(files: File[]): Promise<void> {
    if (files.length === 1) {
      await this.probeSingle(files[0]);
      return;
    }
    this.sendToBatch(files);
    await this.router.navigate(['/app/batch']);
  }

  onFilesRejected(list: RejectedFile[]): void {
    for (const item of list) {
      this.toast.error(`${item.name}: ${item.reason}`);
    }
  }

  async continue(): Promise<void> {
    const file = this.file();
    const probe = this.probe();
    if (!file || !probe || this.uploading()) {
      return;
    }
    this.uploading.set(true);
    try {
      const record = await this.service.upload(file, probe);
      this.store.setUpload(record);
      await this.router.navigate(['/app/selection']);
    } catch (err) {
      this.toast.error((err as Error).message);
    } finally {
      this.uploading.set(false);
    }
  }

  private sendToBatch(files: File[]): void {
    for (const reason of this.batch.addFiles(files)) {
      this.toast.warning(reason);
    }
  }

  private async probeSingle(file: File): Promise<void> {
    this.clearPreview();
    this.file.set(file);
    try {
      this.probe.set(await this.service.probe(file));
    } catch {
      this.toast.error('Não foi possível ler a imagem.');
    }
  }

  private clearPreview(): void {
    const p = this.probe();
    if (p) {
      URL.revokeObjectURL(p.previewUrl);
    }
    this.probe.set(null);
  }
}
