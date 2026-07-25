import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { WorkflowStore } from '../../core/workflow';
import { FileDropzone, ToastService } from '../../shared/ui';
import type { ImageProbe } from './upload.service';
import { UploadService } from './upload.service';

/** Abaixo disto a imagem tende a ficar sem nitidez mesmo no menor botton. */
const LOW_RES_THRESHOLD = 700;

/**
 * UploadPage — passo 1. Valida e envia a imagem (via FileDropzone), mostra
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
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly file = signal<File | null>(null);
  readonly probe = signal<ImageProbe | null>(null);
  readonly uploading = signal(false);

  readonly lowRes = computed(() => {
    const p = this.probe();
    return p !== null && Math.min(p.width, p.height) < LOW_RES_THRESHOLD;
  });

  async onAccepted(file: File): Promise<void> {
    this.clearPreview();
    this.file.set(file);
    try {
      this.probe.set(await this.service.probe(file));
    } catch {
      this.toast.error('Não foi possível ler a imagem.');
    }
  }

  onRejected(message: string): void {
    this.toast.error(message);
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

  private clearPreview(): void {
    const p = this.probe();
    if (p) {
      URL.revokeObjectURL(p.previewUrl);
    }
    this.probe.set(null);
  }
}
