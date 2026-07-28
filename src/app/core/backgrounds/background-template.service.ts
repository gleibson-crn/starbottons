import { inject, Injectable } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import { AuthService } from '../auth';
import { SupabaseClientService } from '../supabase';
import {
  downscaleImageFile,
  loadImage,
  safeFileName,
  withConfiguredHost,
} from '../../shared/utils';

const BUCKET = 'uploads';
const TABLE = 'background_templates';
const TTL_SECONDS = 3600;
const COLUMNS =
  'id,name,storage_path,mime,bytes,width_px,height_px,requested_by,created_at';

/** Linha crua de `public.background_templates` (snake_case do Postgres). */
interface BackgroundRow {
  id: string;
  name: string;
  storage_path: string;
  mime: string;
  bytes: number;
  width_px: number;
  height_px: number;
  requested_by: string | null;
  created_at: string;
}

/** Imagem de fundo pré-cadastrada, mapeada p/ o app + thumbnail assinado. */
export interface BackgroundTemplate {
  readonly id: string;
  readonly name: string;
  readonly storagePath: string;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  readonly createdAt: string;
  readonly thumbUrl: string | null;
}

/** Dados p/ cadastrar um novo template de fundo. */
export interface SaveBackgroundInput {
  readonly name: string;
  readonly file: File;
}

/**
 * BackgroundTemplateService — CRUD dos templates de FUNDO do botton (galeria da
 * aba "Fundo" do lote + área de curadoria). Vive em `core` porque é consumido
 * por DUAS features (batch e backgrounds). O binário fica no bucket EXISTENTE
 * `uploads` (o mesmo de onde a Edge baixa a imagem de fundo). Single-tenant:
 * sem `client_id`. Diferente do ContextualTemplateService, NÃO recodifica em
 * WebP — a imagem vai à impressão, então PNG/JPEG são preservados (ADR-002).
 */
@Injectable({ providedIn: 'root' })
export class BackgroundTemplateService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly auth = inject(AuthService);
  private readonly config = inject(APP_CONFIG);

  /** Lista templates (mais recentes primeiro) já com thumbnail assinado. */
  async list(): Promise<BackgroundTemplate[]> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .select(COLUMNS)
      .order('created_at', { ascending: false });
    if (error) {
      throw new Error(`Falha ao listar fundos: ${error.message}`);
    }
    const rows = (data as BackgroundRow[] | null) ?? [];
    return Promise.all(rows.map((r) => this.toTemplate(r)));
  }

  /** Sobe o arquivo (PNG/JPEG) ao bucket `uploads` e registra a linha. */
  async save(input: SaveBackgroundInput): Promise<BackgroundTemplate> {
    // Reduz fotos grandes: o fundo nunca precisa exceder o tamanho da arte
    // (827px) e imagens grandes estouram o limite de CPU do worker na geração.
    const file = await downscaleImageFile(input.file);
    const { width, height } = await this.probe(file);
    const path = `${this.userId()}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    await this.uploadFile(path, file);
    const row = await this.insertRow(path, { ...input, file }, width, height);
    return this.toTemplate(row);
  }

  /** Exclui o template (linha + objeto no bucket `uploads`). */
  async remove(template: BackgroundTemplate): Promise<void> {
    const { error } = await this.supabase.from(TABLE).delete().eq('id', template.id);
    if (error) {
      throw new Error(`Falha ao excluir: ${error.message}`);
    }
    await this.supabase.storage.from(BUCKET).remove([template.storagePath]);
  }

  /** Assina o objeto do bucket p/ exibir a thumbnail (host reescrito p/ o app). */
  async signThumb(storagePath: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, TTL_SECONDS);
      return error ? null : withConfiguredHost(data?.signedUrl ?? null, this.config.supabaseUrl);
    } catch {
      return null;
    }
  }

  private userId(): string {
    return this.auth.user()?.id ?? 'anon';
  }

  /** Lê largura/altura naturais do arquivo (sem re-encode). */
  private async probe(file: File): Promise<{ width: number; height: number }> {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      return { width: img.naturalWidth, height: img.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Sobe o arquivo original ao bucket privado `uploads`; lança em erro. */
  private async uploadFile(path: string, file: File): Promise<void> {
    const up = await this.supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) {
      throw new Error(`Falha no upload do fundo: ${up.error.message}`);
    }
  }

  private async insertRow(
    path: string,
    input: SaveBackgroundInput,
    width: number,
    height: number,
  ): Promise<BackgroundRow> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .insert({
        name: input.name,
        storage_path: path,
        mime: input.file.type,
        bytes: input.file.size,
        width_px: width,
        height_px: height,
        requested_by: this.userId(),
      })
      .select(COLUMNS)
      .single();
    if (error || !data) {
      throw new Error(`Falha ao registrar fundo: ${error?.message ?? 'sem id'}`);
    }
    return data as BackgroundRow;
  }

  private async toTemplate(row: BackgroundRow): Promise<BackgroundTemplate> {
    return {
      id: row.id,
      name: row.name,
      storagePath: row.storage_path,
      mime: row.mime,
      width: row.width_px,
      height: row.height_px,
      createdAt: row.created_at,
      thumbUrl: await this.signThumb(row.storage_path),
    };
  }
}
