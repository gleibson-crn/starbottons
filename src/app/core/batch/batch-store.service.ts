import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { buildGenerateRequest, GenerationGateway, GenerationService } from '../generation';
import { TreatedUploadService, UploadService } from '../upload';
import {
  duplicateLabels,
  errorText,
  needsTreated,
  pendingJobsOf,
  roundSpec,
  sourceUpload,
  treatSourceUrl,
} from './batch-generation-helpers';
import type {
  GenerationResult,
  ImageFilters,
  StyleEffect,
  UploadRecord,
} from '../../shared/types';
import { DEFAULT_STYLE_EFFECT } from '../../shared/types';
import { runPool } from '../../shared/utils';
import { MAX_IMAGES, MAX_TOTAL_ARTES, GENERATION_CONCURRENCY } from './batch.constants';
import {
  newUploadingItem, withArt, withFilters, withStyle, withAiStyle, withCutout,
  withGenerationUpload, withName, withSeqLabel, withToggledSize, withTransform,
  withFacePreview, withUpload, withUploadError, clearUploadError,
} from './batch-item';
import { isNameValid } from './batch-naming';
import { EventTallyService } from './event-tally.service';
import { ZipExportService, type ZipResult } from './zip-export.service';
import { BatchPersistenceService } from './batch-persistence.service';
import { createDebouncer } from './batch-autosave';
import { restoreItems } from './batch-restore';
import { fromSnapshot, toSnapshot, type Snapshot } from './batch-snapshot';
import type { EditorTransform } from '../../shared/types';
import type { ArtStatus, BatchItem, BottonSize } from './batch.types';

/** Debounce da gravação do snapshot (BL-008). */
const SAVE_DEBOUNCE_MS = 500;

/** Uma unidade de trabalho de geração: item × tamanho. */
interface ArtJob {
  readonly itemId: string;
  readonly size: BottonSize;
}

/**
 * BatchStore — estado do LOTE (signals). Orquestra upload múltiplo, gating por
 * tamanho, pré-insert com `batch_id` e geração paralela via pool, atualizando o
 * status de cada arte. Reusa `core/upload`, `core/generation` e `shared/utils`.
 */
@Injectable({ providedIn: 'root' })
export class BatchStore {
  private readonly uploads = inject(UploadService);
  private readonly treated = inject(TreatedUploadService);
  private readonly generation = inject(GenerationService);
  private readonly gateway = inject(GenerationGateway);
  private readonly zip = inject(ZipExportService);
  private readonly persistence = inject(BatchPersistenceService);
  private readonly tally = inject(EventTallyService);
  private readonly autosave = createDebouncer(() => this.flushPersist(), SAVE_DEBOUNCE_MS);

  readonly items = signal<BatchItem[]>([]);
  readonly generating = signal(false);
  /** Imprime o nº sequencial na sangria (eventos). */
  readonly numbered = signal(false);
  /** Snapshot de `items` no último ZIP exportado (base de `savedToZip`). */
  private readonly zippedSnapshot = signal<BatchItem[] | null>(null);
  private batchId: string = crypto.randomUUID();
  private controller = new AbortController();
  /**
   * File ORIGINAL de cada item, retido para permitir REENVIAR quando o upload
   * falha (ex.: "JWT issued at future" por relógio dessincronizado) — sem o
   * usuário ter que remover e reselecionar a imagem. Limpo em remove/reset.
   */
  private readonly files = new Map<string, File>();

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

  /** `true` se o lote é numerado e algum item a gerar está sem número (senha). */
  readonly seqMissing = computed(
    () =>
      this.numbered() &&
      this.items().some((i) => i.upload && i.selectedSizes.size > 0 && i.seqLabel === ''),
  );

  /** Senhas (não vazias) repetidas em >1 item — aviso, não bloqueia. */
  readonly duplicateSeqLabels = computed(() => duplicateLabels(this.items()));

  /**
   * Imagens enviadas que ainda não têm NENHUM tamanho selecionado. Sempre têm
   * saída: o usuário marca um tamanho (mesmo 🔴, sob aviso) ou remove a imagem.
   */
  readonly itemsSemTamanho = computed(
    () => this.items().filter((i) => i.upload && i.selectedSizes.size === 0).length,
  );

  /** Há QUALQUER trabalho no lote (inclui imagens editadas ainda não geradas). */
  readonly hasWork = computed(() => this.items().length > 0);

  /** `true` se o lote atual já foi exportado em ZIP e não mudou desde então. */
  readonly savedToZip = computed(
    () => this.zippedSnapshot() !== null && this.zippedSnapshot() === this.items(),
  );

  /** Lote já saiu do estado idle (geração iniciada ou artes resolvidas). */
  readonly started = computed(
    () => this.generating() || this.artesProntas() > 0 || this.artesFalhas() > 0,
  );

  readonly podeGerar = computed(
    () =>
      !this.generating() &&
      this.hasPending() &&
      !this.nameMissing() &&
      !this.seqMissing() &&
      this.itemsSemTamanho() === 0,
  );

  constructor() {
    // BL-008: grava o JSON do lote (debounced) a cada mudança de `items`.
    effect(() => {
      this.items();
      untracked(() => this.scheduleSave());
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flushPersist();
        }
      });
    }
  }

  /** Força a gravação imediata do snapshot (cancela o debounce). */
  flushPersist(): void {
    this.autosave.cancel();
    const items = this.items();
    if (items.length === 0 || !this.persistence.available) {
      return;
    }
    // Best-effort: um timer de debounce pode disparar tarde (ex.: injetor já
    // destruído em teardown) — persistir NUNCA deve derrubar o app.
    try {
      const userId = this.persistence.currentUserId();
      if (userId) {
        void this.persistence.save(toSnapshot(items, this.batchId, userId, Date.now(), this.numbered()));
      }
    } catch {
      /* persistência é best-effort; ignora */
    }
  }

  /** Snapshot salvo VÁLIDO (TTL ≤7d, mesmo usuário) e só se o lote atual está vazio. */
  async loadResumable(): Promise<Snapshot | null> {
    return this.hasWork() ? null : this.persistence.load();
  }

  /** Apaga o lote persistido (snapshot + blobs). */
  async clearPersisted(): Promise<void> {
    this.autosave.cancel();
    await this.persistence.clear();
  }

  /** Reconstrói o lote a partir do snapshot, re-assinando as artes prontas. */
  async restore(snapshot: Snapshot): Promise<void> {
    const result = await restoreItems(fromSnapshot(snapshot), {
      gateway: this.gateway,
      getBlob: (id) => this.persistence.getBlob(id),
    });
    if (result.items.length === 0) {
      await this.clearPersisted();
      return;
    }
    this.batchId = snapshot.batchId;
    for (const [id, file] of result.files) {
      this.files.set(id, file);
    }
    this.numbered.set(snapshot.numbered ?? false);
    this.items.set(result.items);
  }

  private scheduleSave(): void {
    this.autosave.cancel();
    if (this.items().length > 0 && this.persistence.available) {
      this.autosave.schedule();
    }
  }

  /**
   * Zera o lote — começa um botton novo do zero. Cancela geração em voo, revoga
   * os previews (object URLs) e renova o `batchId`. Chamado ao "Continuar" do
   * upload para que cada envio produza um lote NOVO (sem acumular no anterior).
   */
  reset(): void {
    this.cancel();
    for (const item of this.items()) {
      if (item.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }
    this.items.set([]);
    this.numbered.set(false);
    this.files.clear();
    this.batchId = crypto.randomUUID();
    void this.clearPersisted();
  }

  /** Adiciona imagens (respeita MAX_IMAGES); retorna motivos de recusa. */
  addFiles(files: File[]): string[] {
    const room = Math.max(0, MAX_IMAGES - this.items().length);
    const accepted = files.slice(0, room);
    const overflow = files
      .slice(accepted.length)
      .map((f) => `${f.name}: limite de ${MAX_IMAGES} imagens atingido.`);
    for (const file of accepted) {
      const id = crypto.randomUUID();
      this.files.set(id, file); // retém p/ permitir reenviar em caso de falha
      void this.persistence.putBlob(id, file); // fallback até o upload concluir
      this.items.update((list) => [...list, newUploadingItem(id, file)]);
      void this.uploadOne(id, file);
    }
    return overflow;
  }

  /**
   * Reenvia uma imagem cujo UPLOAD falhou, reusando o File ORIGINAL retido — o
   * usuário não precisa remover e reselecionar (nem reenviar as que já subiram).
   * No-op se não há File (item já removido) ou o upload já concluiu.
   */
  async retryUpload(id: string): Promise<void> {
    const file = this.files.get(id);
    const item = this.find(id);
    if (!file || !item || item.upload) {
      return;
    }
    this.patch(id, clearUploadError); // volta o card para "Enviando…"
    await this.uploadOne(id, file);
  }

  removeItem(id: string): void {
    const item = this.find(id);
    if (item?.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl);
    }
    this.files.delete(id);
    void this.persistence.deleteBlob(id);
    this.items.update((list) => list.filter((i) => i.id !== id));
    if (this.items().length === 0) {
      void this.clearPersisted();
    }
  }

  toggleSize(id: string, size: BottonSize): void {
    const capped = this.capped();
    this.patch(id, (i) => withToggledSize(i, size, capped));
  }

  setName(id: string, name: string): void {
    this.patch(id, (i) => withName(i, name));
  }

  /** Define o número (senha) manual do item; sanitiza (dígitos, ≤8). */
  setSeqLabel(id: string, value: string): void {
    this.patch(id, (i) => withSeqLabel(i, value));
  }

  setTransform(id: string, transform: EditorTransform, editorSide: number): void {
    this.patch(id, (i) => withTransform(i, transform, editorSide));
  }

  /** Guarda a prévia da face composta (dataURL) do item; `null` limpa. */
  setItemFacePreview(id: string, dataUrl: string | null): void {
    this.patch(id, (i) => withFacePreview(i, dataUrl));
  }

  /** Define os filtros de tratamento de um item (invalida o tratado em cache). */
  setItemFilters(id: string, filters: ImageFilters): void {
    this.patch(id, (i) => withFilters(i, filters));
  }

  /** Define o efeito de estilo de um item (ADR-019; invalida o tratado em cache). */
  setItemStyle(id: string, style: StyleEffect): void {
    this.patch(id, (i) => withStyle(i, style));
  }

  /**
   * Trilha 2 (ADR-021) — grava o upload tratado ESTILIZADO por IA já
   * materializado pelo diálogo. Marca `aiStyled` (força `needsTreated`) e zera
   * filtros/estilo locais. DEVE ser chamado por ÚLTIMO no pai (depois de
   * `setItemFilters`/`setItemStyle`, que resetam `aiStyled`).
   */
  setItemAiStyle(id: string, upload: UploadRecord): void {
    this.patch(id, (i) => withAiStyle(i, upload));
  }

  /** "Remover fundo": grava o recorte (PNG com alfa) ou DESFAZ com `null`. */
  setItemCutout(id: string, upload: UploadRecord | null): void {
    this.patch(id, (i) => withCutout(i, upload));
  }

  /** Exporta as artes prontas em ZIP (download). Marca `savedToZip` se houve arquivos. */
  async exportZip(): Promise<ZipResult> {
    const snapshot = this.items();
    const result = await this.zip.export(snapshot);
    if (result.zipped > 0) {
      this.zippedSnapshot.set(snapshot);
    }
    return result;
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
    await this.prepareTreatedUploads(jobs);
    const tasks = jobs.map((job) => () => this.runArt(job));
    await runPool(tasks, {
      // Serial (1): a Edge local é um worker único — gerar vários tamanhos em
      // paralelo estoura CPU (546)/indisponível (503). Ver GENERATION_CONCURRENCY.
      concurrency: GENERATION_CONCURRENCY,
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
    const source = sourceUpload(item, item.upload);
    const request = buildGenerateRequest({
      uploadId: source.id,
      sizeMm: job.size,
      spec: roundSpec(job.size),
      transform: item.transform,
      editorSide: item.editorSide,
      sequenceLabel: this.numbered() && item.seqLabel ? item.seqLabel : null,
    });
    const jobId = await this.ensureJob(job, source.id, request);
    return this.generation.generate(request, {
      jobId,
      signal: this.controller.signal,
    });
  }

  /**
   * Materializa UMA vez o upload tratado de cada item com filtros ativos que
   * ainda não tem cache. Reusa `TreatedUploadService` (ADR-014) e preserva a
   * idempotência: todos os tamanhos do item compartilham o mesmo tratado.
   */
  private async prepareTreatedUploads(jobs: ArtJob[]): Promise<void> {
    for (const id of new Set(jobs.map((j) => j.itemId))) {
      const item = this.find(id);
      if (item?.upload && needsTreated(item) && !item.generationUpload) {
        await this.materializeTreated(item);
      }
    }
  }

  private async materializeTreated(item: BatchItem): Promise<void> {
    try {
      const record = await this.treated.createTreatedUploadFromUrl(
        treatSourceUrl(item),
        item.filters,
        item.fileName,
        item.style ?? DEFAULT_STYLE_EFFECT,
      );
      this.patch(item.id, (i) => withGenerationUpload(i, record));
    } catch {
      // Mantém generationUpload null → runArt marca as artes do item como falha.
    }
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
          jobId: res.value.jobId,
          errorMessage: null,
        }),
      );
      this.tally.record(this.find(job.itemId)?.seqLabel ?? '');
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
      void this.persistence.deleteBlob(id); // original já está no bucket
    } catch (err) {
      this.patch(id, (i) => withUploadError(i, errorText(err)));
    }
  }

  private pendingJobs(): ArtJob[] {
    return pendingJobsOf(this.items(), isNameValid);
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
