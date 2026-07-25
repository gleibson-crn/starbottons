import { inject, Injectable } from '@angular/core';
import type {
  AssetKind,
  AssetRecord,
  EdgeAsset,
  GenerateOptionsBody,
  GenerationResult,
} from '../../shared/types';
import { GenerationGateway } from './generation.gateway';
import { GenerationTimeoutError } from './generation-timeout.error';
import { TerminalGenerationError } from './terminal-generation.error';

/** Opções (com defaults) do fluxo de geração — sobrescritas em testes. */
export interface GenerateOptions {
  syncTimeoutMs?: number;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  maxRetries?: number;
  onProgress?: (pct: number | null) => void;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

interface ResolvedOptions {
  syncTimeoutMs: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  maxRetries: number;
  onProgress: (pct: number | null) => void;
  sleep: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

const DEFAULTS: ResolvedOptions = {
  syncTimeoutMs: 8000,
  pollIntervalMs: 2000,
  pollTimeoutMs: 60000,
  maxRetries: 3,
  onProgress: () => undefined,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/**
 * GenerationService — chama `generate-art` em modo síncrono e, se vier 202 ou
 * estourar 8s, faz fallback de polling em `generation_jobs`. Reenvia o MESMO
 * `job_id` (idempotente, backend faz UPSERT) em até 3 tentativas.
 */
@Injectable({ providedIn: 'root' })
export class GenerationService {
  private readonly gateway = inject(GenerationGateway);

  async generate(
    request: GenerateOptionsBody,
    options: GenerateOptions = {},
  ): Promise<GenerationResult> {
    const cfg = { ...DEFAULTS, ...options };
    const jobId = crypto.randomUUID();
    const body = { ...request, job_id: jobId };
    let lastError: unknown;
    for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
      this.assertNotAborted(cfg);
      try {
        return await this.runOnce(body, jobId, cfg);
      } catch (err) {
        if (err instanceof TerminalGenerationError) {
          throw err;
        }
        lastError = err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Falha ao gerar a arte.');
  }

  private async runOnce(
    body: unknown,
    jobId: string,
    cfg: ResolvedOptions,
  ): Promise<GenerationResult> {
    cfg.onProgress(null);
    try {
      const res = await this.gateway.invokeGenerate(body, cfg.syncTimeoutMs);
      if (res.status === 200) {
        return this.fromEdge(res.body, jobId);
      }
      if (res.status === 202) {
        return this.poll(jobId, cfg);
      }
      throw new Error(`Falha na geração (HTTP ${res.status}).`);
    } catch (err) {
      if (err instanceof GenerationTimeoutError) {
        return this.poll(jobId, cfg);
      }
      throw err;
    }
  }

  private async poll(
    jobId: string,
    cfg: ResolvedOptions,
  ): Promise<GenerationResult> {
    const maxIterations = Math.ceil(cfg.pollTimeoutMs / cfg.pollIntervalMs);
    for (let i = 1; i <= maxIterations; i++) {
      this.assertNotAborted(cfg);
      await cfg.sleep(cfg.pollIntervalMs);
      cfg.onProgress(Math.min(95, Math.round((i / maxIterations) * 100)));
      const job = await this.gateway.fetchJob(jobId);
      if (job?.status === 'done') {
        return this.fromAssets(jobId);
      }
      if (job?.status === 'error') {
        throw new TerminalGenerationError(job.errorMessage ?? 'A geração falhou.');
      }
    }
    throw new Error('Tempo esgotado ao acompanhar a geração.');
  }

  private assertNotAborted(cfg: ResolvedOptions): void {
    if (cfg.signal?.aborted) {
      throw new Error('Geração cancelada.');
    }
  }

  /** Monta o resultado a partir da resposta 200 (assets já com signed_url). */
  private fromEdge(body: unknown, jobId: string): GenerationResult {
    const b = (body ?? {}) as { job_id?: string; assets?: EdgeAsset[] };
    const url = (kind: AssetKind): string | null =>
      b.assets?.find((a) => a.kind === kind)?.signed_url ?? null;
    return {
      jobId: b.job_id ?? jobId,
      printPngUrl: url('print_png'),
      printPdfUrl: url('print_pdf'),
    };
  }

  /** Monta o resultado após polling: busca assets por job_id e assina cada um. */
  private async fromAssets(jobId: string): Promise<GenerationResult> {
    const assets = await this.gateway.fetchAssets(jobId);
    return {
      jobId,
      printPngUrl: await this.signKind(assets, 'print_png'),
      printPdfUrl: await this.signKind(assets, 'print_pdf'),
    };
  }

  private signKind(
    assets: AssetRecord[],
    kind: AssetKind,
  ): Promise<string | null> {
    const asset = assets.find((a) => a.kind === kind);
    return asset ? this.gateway.signRender(asset.storagePath) : Promise.resolve(null);
  }
}
