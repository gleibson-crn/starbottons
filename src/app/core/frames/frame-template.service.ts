import { inject, Injectable } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import { AuthService } from '../auth';
import { SupabaseClientService } from '../supabase';
import type { Framing } from '../../shared/types';
import {
  downscaleImageFile,
  loadImage,
  safeFileName,
  sniffImageMime,
  withConfiguredHost,
} from '../../shared/utils';

const BUCKET = 'uploads';
const TABLE = 'frame_templates';
const TTL_SECONDS = 3600;
const COLUMNS =
  // Literal único (sem concatenação) p/ o supabase-js inferir o tipo da seleção.
  'id,name,storage_path,mime,bytes,width_px,height_px,requested_by,created_at,default_offset_x,default_offset_y,default_scale,default_rotation,is_composite';

/** Linha crua de `public.frame_templates` (snake_case do Postgres). */
interface FrameRow {
  id: string;
  name: string;
  storage_path: string;
  mime: string;
  bytes: number;
  width_px: number;
  height_px: number;
  requested_by: string | null;
  created_at: string;
  default_offset_x: number | null;
  default_offset_y: number | null;
  default_scale: number | null;
  default_rotation: number | null;
  is_composite: boolean | null;
}

/** Moldura pré-cadastrada, mapeada p/ o app + thumbnail assinado. */
export interface FrameTemplate {
  readonly id: string;
  readonly name: string;
  readonly storagePath: string;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  readonly createdAt: string;
  readonly thumbUrl: string | null;
  /** Enquadramento padrão da moldura; `offset` em FRAÇÃO do lado do editor (não px). */
  readonly defaultFraming: Framing;
  /** `true` quando a moldura tem >1 camada (o PNG em `storagePath` é o ACHATADO). */
  readonly isComposite: boolean;
}

/** Camada persistida de uma moldura composta (offset = fração do lado da composição). */
export interface CompositionLayer {
  readonly id: string;
  readonly storagePath: string;
  /** URL assinada p/ exibir a camada (vazia se a assinatura falhar). */
  readonly url: string;
  readonly offset: { x: number; y: number };
  readonly scale: number;
  readonly rotation: number;
  readonly source: 'upload' | 'template';
  readonly originTemplateId: string | null;
}

/** Entrada p/ gravar uma camada; a `position` é o índice no array. */
export interface CompositionLayerInput {
  readonly storagePath: string;
  readonly offset: { x: number; y: number };
  readonly scale: number;
  readonly rotation: number;
  readonly source: 'upload' | 'template';
  readonly originTemplateId?: string | null;
}

interface LayerRow {
  id: string;
  storage_path: string;
  offset_x: number;
  offset_y: number;
  scale: number;
  rotation: number;
  source: 'upload' | 'template';
  origin_template_id: string | null;
}

const LAYERS_TABLE = 'frame_template_layers';
const LAYER_COLUMNS = 'id,storage_path,offset_x,offset_y,scale,rotation,source,origin_template_id';
export const MAX_COMPOSITION_LAYERS = 8;

/** Dados p/ cadastrar uma nova moldura. */
export interface SaveFrameInput {
  readonly name: string;
  readonly file: File;
}

/**
 * FrameTemplateService — CRUD dos templates de MOLDURA do botton (galeria da aba
 * "Moldura" do lote + área de curadoria em `/app/frames`). Espelha o
 * BackgroundTemplateService, MAS a moldura é a camada decorativa POR CIMA da arte
 * e SÓ aceita PNG com transparência (`image/png`) — a transparência é o que
 * revela a arte por baixo. Vive em `core` porque é consumido por DUAS features
 * (batch e frames). O binário fica no bucket EXISTENTE `uploads` (o mesmo de onde
 * a Edge baixa as camadas). Single-tenant: sem `client_id`. O downscale preserva
 * o alfa (PNG→PNG).
 *
 * Composição por camadas (tudo neste serviço, pois `remove`/`save` precisam das
 * camadas): `listLayers`, `saveComposition`, `copyPng`. O PNG ACHATADO fica em
 * `frame_templates.storage_path`; as camadas em `frame_template_layers`.
 * `save()` (upload simples) já cria a camada 0 (= o próprio PNG, neutra), logo
 * toda moldura tem >=1 camada (as pré-existentes ganharam via backfill da migração).
 */
@Injectable({ providedIn: 'root' })
export class FrameTemplateService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly auth = inject(AuthService);
  private readonly config = inject(APP_CONFIG);

  /** Lista templates (mais recentes primeiro) já com thumbnail assinado. */
  async list(): Promise<FrameTemplate[]> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .select(COLUMNS)
      .order('created_at', { ascending: false });
    if (error) {
      throw new Error(`Falha ao listar molduras: ${error.message}`);
    }
    const rows = (data as FrameRow[] | null) ?? [];
    return Promise.all(rows.map((r) => this.toTemplate(r)));
  }

  /** Sobe o arquivo (PNG) ao bucket `uploads` e registra a linha. */
  async save(input: SaveFrameInput): Promise<FrameTemplate> {
    // Só PNG: a moldura é a camada decorativa por cima da arte e depende da
    // transparência para revelar o que está por baixo.
    if (input.file.type !== 'image/png') {
      throw new Error('A moldura precisa ser um PNG com transparência.');
    }
    // Defesa extra (BL-002): confere os magic bytes REAIS — o `file.type` é
    // forjável (basta renomear). Feedback precoce ao usuário; a Edge também
    // revalida por assinatura antes de compor/imprimir.
    const head = new Uint8Array(await input.file.slice(0, 8).arrayBuffer());
    if (sniffImageMime(head) !== 'image/png') {
      throw new Error('O arquivo não é um PNG válido (conteúdo não corresponde à extensão).');
    }
    // Reduz molduras grandes: nunca precisam exceder o tamanho da arte (827px) e
    // imagens grandes estouram o limite de CPU do worker na geração. PNG→PNG
    // preserva o alfa.
    const file = await downscaleImageFile(input.file);
    const { width, height } = await this.probe(file);
    const path = `${this.userId()}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    await this.uploadFile(path, file);
    const row = await this.insertRow(path, { ...input, file }, width, height);
    const { error } = await this.supabase
      .from(LAYERS_TABLE)
      .insert({ template_id: row.id, position: 0, storage_path: path, source: 'upload' });
    if (error) {
      await this.supabase.from(TABLE).delete().eq('id', row.id);
      await this.removeObjects([path]);
      throw new Error(`Falha ao registrar a camada da moldura: ${error.message}`);
    }
    return this.toTemplate(row);
  }

  /** Camadas da moldura em ordem de empilhamento (`position` asc), com URL assinada. */
  async listLayers(templateId: string): Promise<CompositionLayer[]> {
    const rows = await this.fetchLayerRows(templateId);
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        storagePath: r.storage_path,
        url: (await this.signThumb(r.storage_path)) ?? '',
        offset: { x: r.offset_x, y: r.offset_y },
        scale: r.scale,
        rotation: r.rotation,
        source: r.source,
        originTemplateId: r.origin_template_id,
      })),
    );
  }

  /**
   * Grava a composição: sobe o PNG achatado, troca as camadas, aponta
   * `storage_path` p/ o novo achatado e só então apaga os PNGs órfãos (achatado
   * antigo + camadas removidas). Em falha após o upload, remove o que subiu.
   */
  async saveComposition(
    templateId: string,
    layers: CompositionLayerInput[],
    flatBlob: Blob,
  ): Promise<FrameTemplate> {
    if (layers.length < 1 || layers.length > MAX_COMPOSITION_LAYERS) {
      throw new Error(`A moldura precisa ter de 1 a ${MAX_COMPOSITION_LAYERS} camadas.`);
    }
    const oldPaths = await this.currentPaths(templateId);
    const flatPath = `frame-composites/${crypto.randomUUID()}.png`;
    await this.uploadBlob(flatPath, flatBlob);
    try {
      await this.replaceLayers(templateId, layers);
      const row = await this.updateFlat(templateId, flatPath, layers.length > 1);
      const keep = new Set([flatPath, ...layers.map((l) => l.storagePath)]);
      await this.removeObjects(oldPaths.filter((p) => !keep.has(p)));
      return await this.toTemplate(row);
    } catch (e) {
      await this.removeObjects([flatPath]);
      throw e;
    }
  }

  /** Copia um PNG do bucket p/ um novo path (camada independente); devolve o novo path. */
  async copyPng(srcStoragePath: string): Promise<string> {
    const dst = `frame-layers/${crypto.randomUUID()}.png`;
    const { error } = await this.supabase.storage.from(BUCKET).copy(srcStoragePath, dst);
    if (error) {
      throw new Error(`Falha ao copiar a moldura: ${error.message}`);
    }
    return dst;
  }

  /**
   * Persiste o enquadramento padrão da moldura. Recebe o framing JÁ NORMALIZADO:
   * `offset` é FRAÇÃO do lado do editor (não px/mm) — a normalização é do
   * componente, não do serviço. Devolve o template atualizado.
   */
  async updateFraming(id: string, framing: Framing): Promise<FrameTemplate> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .update({
        default_offset_x: framing.offset.x,
        default_offset_y: framing.offset.y,
        default_scale: framing.scale,
        default_rotation: framing.rotation,
      })
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (error || !data) {
      throw new Error(`Falha ao salvar enquadramento: ${error?.message ?? 'sem retorno'}`);
    }
    return this.toTemplate(data as FrameRow);
  }

  /** Exclui o template (linha + objeto no bucket `uploads`). */
  async remove(template: FrameTemplate): Promise<void> {
    const layerPaths = (await this.fetchLayerRows(template.id)).map((r) => r.storage_path);
    const { error } = await this.supabase.from(TABLE).delete().eq('id', template.id);
    if (error) {
      throw new Error(`Falha ao excluir: ${error.message}`);
    }
    // Linhas das camadas caem por CASCADE; aqui só os objetos (achatado + camadas).
    await this.removeObjects([template.storagePath, ...layerPaths]);
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

  private async fetchLayerRows(templateId: string): Promise<LayerRow[]> {
    const { data, error } = await this.supabase
      .from(LAYERS_TABLE)
      .select(LAYER_COLUMNS)
      .eq('template_id', templateId)
      .order('position', { ascending: true });
    if (error) {
      throw new Error(`Falha ao listar camadas: ${error.message}`);
    }
    return (data as LayerRow[] | null) ?? [];
  }

  /** Paths hoje em uso pela moldura: achatado atual + PNGs das camadas. */
  private async currentPaths(templateId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .select('storage_path')
      .eq('id', templateId)
      .single();
    if (error || !data) {
      throw new Error(`Moldura não encontrada: ${error?.message ?? 'sem retorno'}`);
    }
    const layers = await this.fetchLayerRows(templateId);
    return [(data as { storage_path: string }).storage_path, ...layers.map((l) => l.storage_path)];
  }

  private async replaceLayers(templateId: string, layers: CompositionLayerInput[]): Promise<void> {
    const del = await this.supabase.from(LAYERS_TABLE).delete().eq('template_id', templateId);
    if (del.error) {
      throw new Error(`Falha ao substituir camadas: ${del.error.message}`);
    }
    const ins = await this.supabase.from(LAYERS_TABLE).insert(
      layers.map((l, i) => ({
        template_id: templateId,
        position: i,
        storage_path: l.storagePath,
        offset_x: l.offset.x,
        offset_y: l.offset.y,
        scale: l.scale,
        rotation: l.rotation,
        source: l.source,
        origin_template_id: l.originTemplateId ?? null,
      })),
    );
    if (ins.error) {
      throw new Error(`Falha ao gravar camadas: ${ins.error.message}`);
    }
  }

  private async updateFlat(id: string, flatPath: string, composite: boolean): Promise<FrameRow> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .update({ storage_path: flatPath, is_composite: composite })
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (error || !data) {
      throw new Error(`Falha ao salvar composição: ${error?.message ?? 'sem retorno'}`);
    }
    return data as FrameRow;
  }

  private async uploadBlob(path: string, blob: Blob): Promise<void> {
    const up = await this.supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'image/png', upsert: false });
    if (up.error) {
      throw new Error(`Falha no upload da composição: ${up.error.message}`);
    }
  }

  private async removeObjects(paths: string[]): Promise<void> {
    const unique = [...new Set(paths)];
    if (unique.length === 0) return;
    await this.supabase.storage.from(BUCKET).remove(unique);
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
      throw new Error(`Falha no upload da moldura: ${up.error.message}`);
    }
  }

  private async insertRow(
    path: string,
    input: SaveFrameInput,
    width: number,
    height: number,
  ): Promise<FrameRow> {
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
      throw new Error(`Falha ao registrar moldura: ${error?.message ?? 'sem id'}`);
    }
    return data as FrameRow;
  }

  private async toTemplate(row: FrameRow): Promise<FrameTemplate> {
    return {
      id: row.id,
      name: row.name,
      storagePath: row.storage_path,
      mime: row.mime,
      width: row.width_px,
      height: row.height_px,
      createdAt: row.created_at,
      thumbUrl: await this.signThumb(row.storage_path),
      defaultFraming: {
        offset: { x: row.default_offset_x ?? 0, y: row.default_offset_y ?? 0 },
        scale: row.default_scale ?? 1,
        rotation: row.default_rotation ?? 0,
      },
      isComposite: row.is_composite ?? false,
    };
  }
}
