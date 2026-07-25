import { computed, inject, Injectable, signal } from '@angular/core';
import {
  buildGenerateRequest,
  GenerationGateway,
  GenerationService,
} from '../../core/generation';
import { UploadService } from '../../core/upload';
import type { GenerationResult, PrintSpec } from '../../shared/types';
import { fallbackSpec, runPool } from '../../shared/utils';
import {
  MAX_IMAGES,
  MAX_TOTAL_ARTES,
  POOL_CONCURRENCY,
} from './batch.constants';
import {
  newUploadingItem,
  withArt,
  withName,
  withToggledSize,
  withTransform,
  withUpload,
  withUploadError,
} from './batch-item';
import { isNameValid } from './batch-naming';
import type { EditorTransform } from '../../shared/types';
import {
  type ArtStatus,
  type BatchItem,
  type BottonSize,
} from './batch.types';

/** Uma unidade de trabalho de geração: item × tamanho. */
interface ArtJob {
  readonly itemId: string;
  readonly size: BottonSize;
}

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function roundSpec(size: BottonSize): PrintSpec {
  const spec = fallbackSpec('round', size);
  if (!spec) {
    throw new Error(`Sem print_spec para ${size}mm.`);
  }
  return spec;
}

/**
 * BatchStore — estado do LOTE (signals). Orquestra upload múltiplo, gating por
 * tamanho, pré-insert com `batch_id` e geração paralela via pool, atualizando o
 * status de cada arte. Reusa `core/upload`, `core/generation` e `shared/utils`.
 */
@Injectable({ providedIn: 'root' })
export class BatchStore {
  private readonly uploads = inject(UploadService);
  private readonly generation = inject(GenerationService);
  private readonly gateway = inject(GenerationGateway);

  readonly items = signal<BatchItem[]>([]);
  readonly generating = signal(false);
  private readonly batchId = crypto.randomUUID();
  private controller = new AbortController();

  readonly totalArtes = computed(() =>
    this.items().reduce((acc, i) => acc + i.selectedSizes.size, 0),
  );
  readonly remainingArtes = computed(() =>
    Math.max(0, MAX_TOTAL_ARTES - this.totalArtes()),
  );
  readonly capped = computed(() => this.totalArtes() >= MAX_TOTAL_ARTES);
  readonly artesProntas = computed(() => this.countArts('ready'));
  readonly artesGerando = computed(() => this.countArts('generating'));
  readonly artesFalhas = computed(() => this.countArts('failed'));

  /** `true` se alguma imagem com tamanhos selecionados está sem nome. */
  readonly nameMissing = computed(() =>
    this.items().some(
      (i) => i.upload && i.selectedSizes.size > 0 && !isNameValid(i.name),
    ),
  );

  readonly podeGerar = computed(
    () => !this.generating() && this.hasPending() && !this.nameMissing(),
  );

  /** Adiciona imagens (respeita MAX_IMAGES); retorna motivos de recusa. */
  addFiles(files: File[]): string[] {
    const room = Math.max(0, MAX_IMAGES - this.items().length);
    const accepted = files.slice(0, room);
    const overflow = files
      .slice(accepted.length)
      .map((f) => `${f.name}: limite de ${MAX_IMAGES} imagens atingido.`);
    for (const file of accepted) {
      const id = crypto.randomUUID();
      this.items.update((list) => [...list, newUploadingItem(id, file)]);
      void this.uploadOne(id, file);
    }
    return overflow;
  }

  removeItem(id: string): void {
    const item = this.find(id);
    if (item?.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl);
    }
    this.items.update((list) => list.filter((i) => i.id !== id));
  }

  toggleSize(id: string, size: BottonSize): void {
    const capped = this.capped();
    this.patch(id, (i) => withToggledSize(i, size, capped));
  }

  setName(id: string, name: string): void {
    this.patch(id, (i) => withName(i, name));
  }

  setTransform(id: string, transform: EditorTransform, editorSide: number): void {
    this.patch(id, (i) => withTransform(i, transform, editorSide));
  }

  cancel(): void {
    this.controller.abort();
    this.generating.set(false);
  }

  async generateAll(): Promise<void> {
    if (!this.podeGerar()) {
      return;
    }
    await this.runJobs(this.pendingJobs());
  }

  async retryItem(id: string): Promise<void> {
    const item = this.find(id);
    if (!item || this.generating()) {
      return;
    }
    const jobs = [...item.selectedSizes]
      .filter((s) => item.arts[s]?.status === 'failed')
      .map((size) => ({ itemId: id, size }));
    await this.runJobs(jobs);
  }

  retryArt(id: string, size: BottonSize): Promise<void> {
    return this.generating()
      ? Promise.resolve()
      : this.runJobs([{ itemId: id, size }]);
  }

  private async runJobs(jobs: ArtJob[]): Promise<void> {
    if (jobs.length === 0) {
      return;
    }
    this.controller = new AbortController();
    this.generating.set(true);
    for (const job of jobs) {
      this.patch(job.itemId, (i) =>
        withArt(i, job.size, { status: 'generating', errorMessage: null }),
      );
    }
    const tasks = jobs.map((job) => () => this.runArt(job));
    await runPool(tasks, {
      concurrency: POOL_CONCURRENCY,
      signal: this.controller.signal,
      onSettled: (idx, res) => this.onSettled(jobs[idx], res),
    });
    this.generating.set(false);
  }

  private async runArt(job: ArtJob): Promise<GenerationResult> {
    const item = this.find(job.itemId);
    if (!item?.upload) {
      throw new Error('Imagem sem upload concluído.');
    }
    const request = buildGenerateRequest({
      uploadId: item.upload.id,
      sizeMm: job.size,
      spec: roundSpec(job.size),
      transform: item.transform,
      editorSide: item.editorSide,
    });
    const jobId = await this.ensureJob(job, item.upload.id, request);
    return this.generation.generate(request, {
      jobId,
      signal: this.controller.signal,
    });
  }

  /** Reusa o jobId existente (retry idempotente) ou pré-insere um novo. */
  private async ensureJob(
    job: ArtJob,
    uploadId: string,
    request: unknown,
  ): Promise<string> {
    const existing = this.find(job.itemId)?.arts[job.size]?.jobId ?? null;
    if (existing) {
      return existing;
    }
    const jobId = crypto.randomUUID();
    await this.gateway.insertQueuedJob({
      jobId,
      uploadId,
      sizeMm: job.size,
      batchId: this.batchId,
      params: request,
    });
    this.patch(job.itemId, (i) => withArt(i, job.size, { jobId }));
    return jobId;
  }

  private onSettled(job: ArtJob, res: PromiseSettledResult<GenerationResult>): void {
    if (res.status === 'fulfilled') {
      this.patch(job.itemId, (i) =>
        withArt(i, job.size, {
          status: 'ready',
          printPngUrl: res.value.printPngUrl,
          printPdfUrl: res.value.printPdfUrl,
          jobId: res.value.jobId,
          errorMessage: null,
        }),
      );
      return;
    }
    this.patch(job.itemId, (i) =>
      withArt(i, job.size, { status: 'failed', errorMessage: errorText(res.reason) }),
    );
  }

  private async uploadOne(id: string, file: File): Promise<void> {
    try {
      const probe = await this.uploads.probe(file);
      const record = await this.uploads.upload(file, probe);
      this.patch(id, (i) => withUpload(i, record, probe, this.remainingArtes()));
    } catch (err) {
      this.patch(id, (i) => withUploadError(i, errorText(err)));
    }
  }

  private pendingJobs(): ArtJob[] {
    const out: ArtJob[] = [];
    for (const item of this.items()) {
      if (!item.upload || !isNameValid(item.name)) {
        continue;
      }
      for (const size of item.selectedSizes) {
        const status = item.arts[size]?.status ?? 'idle';
        if (status !== 'ready' && status !== 'generating') {
          out.push({ itemId: item.id, size });
        }
      }
    }
    return out;
  }

  private hasPending(): boolean {
    return this.items().some(
      (i) =>
        i.upload &&
        [...i.selectedSizes].some((s) => (i.arts[s]?.status ?? 'idle') !== 'ready'),
    );
  }

  private countArts(status: ArtStatus): number {
    let n = 0;
    for (const item of this.items()) {
      for (const size of item.selectedSizes) {
        if ((item.arts[size]?.status ?? 'idle') === status) {
          n++;
        }
      }
    }
    return n;
  }

  private find(id: string): BatchItem | undefined {
    return this.items().find((i) => i.id === id);
  }

  private patch(id: string, fn: (item: BatchItem) => BatchItem): void {
    this.items.update((list) => list.map((i) => (i.id === id ? fn(i) : i)));
  }
}
