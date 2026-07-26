import { inject, Injectable } from '@angular/core';
import { APP_CONFIG } from '../../core/config/app-config';
import { AuthService } from '../../core/auth';
import { SupabaseClientService } from '../../core/supabase';
import { safeFileName, withConfiguredHost } from '../../shared/utils';
import type { SceneTarget } from './scene-target';
import { encodeScene } from './scene-encode';

const BUCKET = 'mockup_templates';
const TABLE = 'mockup_templates';
const TTL_SECONDS = 3600;
const COLUMNS =
  'id,name,storage_path,mime,bytes,scene_width_px,scene_height_px,target,created_at';

/** Linha crua de `public.mockup_templates` (snake_case do Postgres). */
interface TemplateRow {
  id: string;
  name: string;
  storage_path: string;
  mime: string;
  bytes: number;
  scene_width_px: number;
  scene_height_px: number;
  target: SceneTarget;
  created_at: string;
}

/** Template de cena mapeado p/ o app (camelCase) + thumbnail assinado. */
export interface SceneTemplate {
  readonly id: string;
  readonly name: string;
  readonly storagePath: string;
  readonly sceneWidth: number;
  readonly sceneHeight: number;
  readonly target: SceneTarget;
  readonly createdAt: string;
  readonly thumbUrl: string | null;
}

/** Dados p/ salvar um novo template. */
export interface SaveTemplateInput {
  readonly name: string;
  readonly scene: HTMLImageElement;
  readonly target: SceneTarget;
}

/**
 * Patch de um template existente: sempre reposiciona o alvo; opcionalmente
 * troca a cena. `scene` null/ausente = mantém a foto atual (só atualiza o alvo).
 */
export interface UpdateTemplateInput {
  readonly target: SceneTarget;
  readonly scene?: HTMLImageElement | null;
}

/**
 * CRUD de templates de cenário (bucket privado `mockup_templates`). Single-tenant:
 * sem `client_id`. A cena é recodificada em WebP (≤2000px, sem EXIF) antes do
 * upload; o alvo é persistido normalizado (0..1) em `target`.
 */
@Injectable({ providedIn: 'root' })
export class ContextualTemplateService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly auth = inject(AuthService);
  private readonly config = inject(APP_CONFIG);

  /** Lista templates (mais recentes primeiro) já com thumbnail assinado. */
  async list(): Promise<SceneTemplate[]> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .select(COLUMNS)
      .order('created_at', { ascending: false });
    if (error) {
      throw new Error(`Falha ao listar templates: ${error.message}`);
    }
    const rows = (data as TemplateRow[] | null) ?? [];
    return Promise.all(rows.map((r) => this.toTemplate(r)));
  }

  /** Recodifica + faz upload da cena e registra a linha; devolve o template. */
  async save(input: SaveTemplateInput): Promise<SceneTemplate> {
    const encoded = await encodeScene(input.scene);
    const path = `${this.userId()}/${crypto.randomUUID()}-${safeFileName(input.name)}.webp`;
    await this.uploadScene(path, encoded.blob);
    const row = await this.insertRow(path, input, encoded);
    return this.toTemplate(row);
  }

  /**
   * Atualiza um template: sempre grava o novo `target`; se vier `scene`, troca a
   * foto (re-encoda WebP sem EXIF, sobe ao bucket, aponta a linha p/ o novo
   * objeto e REMOVE o antigo p/ não deixar órfão). Devolve o template atualizado.
   */
  async update(id: string, patch: UpdateTemplateInput): Promise<SceneTemplate> {
    if (!patch.scene) {
      const row = await this.updateRow(id, { target: patch.target });
      return this.toTemplate(row);
    }
    return this.updateWithScene(id, patch.scene, patch.target);
  }

  private async updateWithScene(
    id: string,
    scene: HTMLImageElement,
    target: SceneTarget,
  ): Promise<SceneTemplate> {
    const oldPath = await this.currentPath(id);
    const encoded = await encodeScene(scene);
    const path = `${this.userId()}/${crypto.randomUUID()}-scene.webp`;
    await this.uploadScene(path, encoded.blob);
    const row = await this.updateRow(id, {
      target,
      storage_path: path,
      mime: 'image/webp',
      bytes: encoded.blob.size,
      scene_width_px: encoded.width,
      scene_height_px: encoded.height,
    });
    await this.supabase.storage.from(BUCKET).remove([oldPath]);
    return this.toTemplate(row);
  }

  /** Exclui o template (linha + objeto no bucket). */
  async remove(template: SceneTemplate): Promise<void> {
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

  /** Sobe o blob WebP ao bucket privado; lança em erro. */
  private async uploadScene(path: string, blob: Blob): Promise<void> {
    const up = await this.supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'image/webp', upsert: false });
    if (up.error) {
      throw new Error(`Falha no upload da cena: ${up.error.message}`);
    }
  }

  /** Lê o `storage_path` atual da linha (p/ remover o objeto antigo na troca). */
  private async currentPath(id: string): Promise<string> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .select('storage_path')
      .eq('id', id)
      .single();
    if (error || !data) {
      throw new Error(`Template não encontrado: ${error?.message ?? id}`);
    }
    return (data as { storage_path: string }).storage_path;
  }

  private async updateRow(id: string, changes: Partial<TemplateRow>): Promise<TemplateRow> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .update(changes)
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (error || !data) {
      throw new Error(`Falha ao atualizar template: ${error?.message ?? 'sem id'}`);
    }
    return data as TemplateRow;
  }

  private async insertRow(
    path: string,
    input: SaveTemplateInput,
    encoded: { width: number; height: number; blob: Blob },
  ): Promise<TemplateRow> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .insert({
        name: input.name,
        storage_path: path,
        mime: 'image/webp',
        bytes: encoded.blob.size,
        scene_width_px: encoded.width,
        scene_height_px: encoded.height,
        target: input.target,
      })
      .select(COLUMNS)
      .single();
    if (error || !data) {
      throw new Error(`Falha ao registrar template: ${error?.message ?? 'sem id'}`);
    }
    return data as TemplateRow;
  }

  private async toTemplate(row: TemplateRow): Promise<SceneTemplate> {
    return {
      id: row.id,
      name: row.name,
      storagePath: row.storage_path,
      sceneWidth: row.scene_width_px,
      sceneHeight: row.scene_height_px,
      target: row.target,
      createdAt: row.created_at,
      thumbUrl: await this.signThumb(row.storage_path),
    };
  }
}
