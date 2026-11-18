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
  /**
   * `job_id` externo (idempotente). Se ausente, um UUID é gerado — o fluxo
   * single não muda. O LOTE gera o id, pré-insere o job com `batch_id` e passa
   * o mesmo id aqui, de modo que retry reenvie o mesmo job (UPSERT no backend).
   */
  jobId?: string;
}

interface ResolvedOptions {
  syncTimeoutMs: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  maxRetries: number;
  /** Espera-base do backoff entre tentativas (dobra a cada retry). */
  retryBackoffMs: number;
  onProgress: (pct: number | null) => void;
  sleep: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

const DEFAULTS: ResolvedOptions = {
  // DEVE ser MAIOR que o TIME_BUDGET_MS (25s) da Edge (generate-art): a Edge só
  // degrada para 202 (assíncrono + waitUntil) ao atingir esse orçamento. Se o
  // cliente abortar ANTES disso (o antigo 8s), o supervisor CANCELA a invocação
  // no meio do pipeline → o job fica preso em "processing", nunca marca "done",
  // e o polling estoura ("Tempo esgotado"). Com 30s o cliente sempre recebe 200
  // (pronto) ou 202 (segue em background) antes de abortar. Ver ADR-005.
  syncTimeoutMs: 30000,
  pollIntervalMs: 2000,
  pollTimeoutMs: 60000,
  maxRetries: 3,
  // Backoff entre tentativas (0.8s, 1.6s, 3.2s). Erros 546 (CPU hard limit) e
  // 503 da Edge local são TRANSITÓRIOS (worker sobrecarregado/recuperando);
  // retentar na hora bate na mesma Edge ocupada e falha de novo. Esperar deixa
  // o worker se recuperar antes do reenvio (mesmo job_id, UPSERT idempotente).
  retryBackoffMs: 800,
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
    const jobId = options.jobId ?? crypto.randomUUID();
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
        // Backoff antes da próxima tentativa (não após a última): dá tempo à
        // Edge se recuperar de um 546/503 transitório.
        if (attempt < cfg.maxRetries) {
          await cfg.sleep(cfg.retryBackoffMs * 2 ** (attempt - 1));
        }
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

  /**
   * Re-assina SOB DEMANDA a URL do `print_png` de um job (a signed URL guardada
   * no estado expira). `null` sem `jobId`, sem asset ou em qualquer falha —
   * o chamador cai no fallback (URL antiga).
   */
  async freshPrintUrl(jobId: string | null): Promise<string | null> {
    if (!jobId) {
      return null;
    }
    try {
      return await this.signKind(await this.gateway.fetchAssets(jobId), 'print_png');
    } catch {
      return null;
    }
  }

  /** Monta o resultado a partir da resposta 200 (assets já com signed_url). */
  private fromEdge(body: unknown, jobId: string): GenerationResult {
    const b = (body ?? {}) as { job_id?: string; assets?: EdgeAsset[] };
    const url = (kind: AssetKind): string | null =>
      this.gateway.toConfiguredHost(
        b.assets?.find((a) => a.kind === kind)?.signed_url ?? null,
      );
    return {
      jobId: b.job_id ?? jobId,
      printPngUrl: url('print_png'),
    };
  }

  /** Monta o resultado após polling: busca assets por job_id e assina cada um. */
  private async fromAssets(jobId: string): Promise<GenerationResult> {
    const assets = await this.gateway.fetchAssets(jobId);
    return {
      jobId,
      printPngUrl: await this.signKind(assets, 'print_png'),
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
