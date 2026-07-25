import { inject, Injectable } from '@angular/core';
import { APP_CONFIG } from '../../core/config/app-config';
import { SupabaseClientService } from '../../core/supabase';
import type {
  AssetRecord,
  GatewayResponse,
  GenerationJob,
} from '../../shared/types';
import { GenerationTimeoutError } from './generation-timeout.error';

/** Bucket privado de saída da geração. */
const RENDERS_BUCKET = 'renders';
const TTL_SECONDS = 3600;

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
      return error ? null : (data?.signedUrl ?? null);
    } catch {
      return null;
    }
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
