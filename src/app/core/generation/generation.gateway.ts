import { inject, Injectable } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import { SupabaseClientService } from '../supabase';
import type {
  AssetRecord,
  GatewayResponse,
  GenerationJob,
} from '../../shared/types';
import { withConfiguredHost } from '../../shared/utils';
import { GenerationTimeoutError } from './generation-timeout.error';

/** Bucket privado de saída da geração. */
const RENDERS_BUCKET = 'renders';
// Alinhado ao TTL da Edge: 4h (a UI re-assina sob demanda ao imprimir/baixar).
const TTL_SECONDS = 14400;
/** Bucket privado dos originais enviados. */
const UPLOADS_BUCKET = 'uploads';
const UPLOAD_PREVIEW_TTL_SECONDS = 3600;

interface JobRow {
  id: string;
  status: GenerationJob['status'];
  error_message?: string | null;
}

interface AssetRow {
  kind: AssetRecord['kind'];
  storage_path: string;
}

/**
 * GenerationGateway — encapsula as chamadas cruas: POST à Edge `generate-art`
 * (com timeout via AbortController) e leitura de `generation_jobs`/`assets` +
 * signed URLs do bucket `renders`. Isola o serviço de detalhes de rede/HTTP,
 * tornando a lógica de sync-vs-polling testável com um gateway falso.
 */
@Injectable({ providedIn: 'root' })
export class GenerationGateway {
  private readonly config = inject(APP_CONFIG);
  private readonly supabase = inject(SupabaseClientService).client;

  async invokeGenerate(
    body: unknown,
    timeoutMs: number,
  ): Promise<GatewayResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.config.supabaseUrl}/functions/v1/generate-art`, {
        method: 'POST',
        headers: await this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    } catch (err) {
      if (controller.signal.aborted) {
        throw new GenerationTimeoutError();
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Pré-insere o job com `status='queued'` e o `batch_id` do lote ANTES de
   * chamar a Edge. A Edge faz UPSERT por `id` (preservando `batch_id`), então
   * carimbamos o lote sem tocar na função. Idempotente por `id`.
   */
  async insertQueuedJob(input: {
    jobId: string;
    uploadId: string;
    shape?: string;
    sizeMm: number;
    batchId: string | null;
    params: unknown;
  }): Promise<void> {
    const { error } = await this.supabase.from('generation_jobs').insert({
      id: input.jobId,
      upload_id: input.uploadId,
      shape: input.shape ?? 'round',
      size_mm: input.sizeMm,
      status: 'queued',
      batch_id: input.batchId,
      params: input.params ?? {},
    });
    if (error) {
      throw new Error(`Falha ao registrar job do lote: ${error.message}`);
    }
  }

  async fetchJob(jobId: string): Promise<GenerationJob | null> {
    const { data } = await this.supabase
      .from('generation_jobs')
      .select('id,status,error_message')
      .eq('id', jobId)
      .maybeSingle();
    if (!data) {
      return null;
    }
    const row = data as JobRow;
    return { id: row.id, status: row.status, errorMessage: row.error_message ?? null };
  }

  async fetchAssets(jobId: string): Promise<AssetRecord[]> {
    const { data } = await this.supabase
      .from('assets')
      .select('kind,storage_path')
      .eq('job_id', jobId);
    return ((data as AssetRow[] | null) ?? []).map((r) => ({
      kind: r.kind,
      storagePath: r.storage_path,
    }));
  }

  async signRender(storagePath: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase.storage
        .from(RENDERS_BUCKET)
        .createSignedUrl(storagePath, TTL_SECONDS);
      return error ? null : this.toConfiguredHost(data?.signedUrl ?? null);
    } catch {
      return null;
    }
  }

  /**
   * Assina (1h) o original no bucket privado `uploads` — preview de itens
   * restaurados do lote persistido (BL-008). `null` em falha.
   */
  async signUpload(storagePath: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase.storage
        .from(UPLOADS_BUCKET)
        .createSignedUrl(storagePath, UPLOAD_PREVIEW_TTL_SECONDS);
      return error ? null : this.toConfiguredHost(data?.signedUrl ?? null);
    } catch {
      return null;
    }
  }

  /**
   * Reescreve o host de uma signed URL para o supabaseUrl configurado. A Edge
   * assina com o host interno dela (ex.: kong:8000 no local), que o browser não
   * alcança; em produção os hosts coincidem e isto é no-op.
   */
  toConfiguredHost(url: string | null): string | null {
    return withConfiguredHost(url, this.config.supabaseUrl);
  }

  private async headers(): Promise<HeadersInit> {
    const { data } = await this.supabase.auth.getSession();
    const token = data.session?.access_token ?? this.config.supabaseAnonKey;
    return {
      'Content-Type': 'application/json',
      apikey: this.config.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    };
  }
}
