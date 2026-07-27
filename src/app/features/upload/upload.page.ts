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
import { BatchStore, MAX_IMAGES } from '../../core/batch';
import type { ImageProbe } from '../../core/upload';
import { UploadService } from '../../core/upload';

/** Abaixo disto a imagem tende a ficar sem nitidez mesmo no menor botton. */
const LOW_RES_THRESHOLD = 700;

/** Um arquivo escolhido + seu probe (dimensões e preview local). */
export interface UploadItem {
  readonly file: File;
  readonly probe: ImageProbe;
}

/**
 * UploadPage — passo 1. Dropzone que ACUMULA numa lista: novos arquivos são
 * anexados (não substituem) e podem ser removidos item a item. A decisão
 * single × lote acontece só no "Continuar": 1 item segue o fluxo single
 * (upload + preview → /app/selection); 2+ vão para o BatchStore (→ /app/batch).
 * Cada item mostra thumb + nome + dimensões e um heads-up de baixa resolução.
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

  readonly items = signal<UploadItem[]>([]);
  readonly uploading = signal(false);

  readonly canContinue = computed(() => this.items().length >= 1);
  readonly browseLabel = computed(() =>
    this.items().length >= 1 ? 'Adicionar arquivo' : 'Procurar arquivo',
  );

  /** Marca resolução baixa (menor lado < limite) para heads-up por item. */
  isLowRes(probe: ImageProbe): boolean {
    return Math.min(probe.width, probe.height) < LOW_RES_THRESHOLD;
  }

  /** Anexa novos arquivos à lista, respeitando o teto MAX_IMAGES. */
  async onFilesAccepted(files: File[]): Promise<void> {
    const room = Math.max(0, MAX_IMAGES - this.items().length);
    const accepted = files.slice(0, room);
    for (const file of files.slice(accepted.length)) {
      this.toast.warning(
        `${file.name}: limite de ${MAX_IMAGES} imagens atingido.`,
      );
    }
    for (const file of accepted) {
      await this.appendProbed(file);
    }
  }

  onFilesRejected(list: RejectedFile[]): void {
    for (const item of list) {
      this.toast.error(`${item.name}: ${item.reason}`);
    }
  }

  /** Remove o item do índice, revogando o object URL do preview. */
  remove(index: number): void {
    const item = this.items()[index];
    if (!item) {
      return;
    }
    URL.revokeObjectURL(item.probe.previewUrl);
    this.items.update((list) => list.filter((_, i) => i !== index));
  }

  async continue(): Promise<void> {
    const list = this.items();
    if (list.length === 0 || this.uploading()) {
      return;
    }
    if (list.length === 1) {
      await this.continueSingle(list[0]);
      return;
    }
    this.sendToBatch(list.map((i) => i.file));
    await this.router.navigate(['/app/batch']);
  }

  private async continueSingle(item: UploadItem): Promise<void> {
    this.uploading.set(true);
    try {
      const record = await this.service.upload(item.file, item.probe);
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

  private async appendProbed(file: File): Promise<void> {
    try {
      const probe = await this.service.probe(file);
      this.items.update((list) => [...list, { file, probe }]);
    } catch {
      this.toast.error(`${file.name}: não foi possível ler a imagem.`);
    }
  }
}
