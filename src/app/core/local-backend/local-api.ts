/**
 * Ponte para o backend local (ADR-033), exposta pelo preload do Electron em
 * `window.sb`. No modo web (ng serve puro), `window.sb` não existe e
 * `localBackend()` devolve `null` → os serviços caem no caminho Supabase.
 */

/** Linha de fundo como o SQLite devolve (snake_case). */
export interface LocalBackgroundRow {
  readonly id: string;
  readonly name: string;
  readonly storage_path: string;
  readonly mime: string;
  readonly bytes: number | null;
  readonly width_px: number | null;
  readonly height_px: number | null;
  readonly created_at: string;
}

/** Dados p/ salvar um fundo no backend local (bytes já tratados no renderer). */
export interface LocalBackgroundInput {
  readonly name: string;
  readonly bytes: ArrayBuffer;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
}

/** Alvo da cena (círculo normalizado 0..1 + rotação) — estrutura de SceneTarget. */
export interface LocalSceneTarget {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly rotation: number;
}

/** Linha de mockup como o SQLite devolve (target já desserializado). */
export interface LocalMockupRow {
  readonly id: string;
  readonly name: string;
  readonly storage_path: string;
  readonly mime: string;
  readonly bytes: number | null;
  readonly scene_width_px: number | null;
  readonly scene_height_px: number | null;
  readonly target: LocalSceneTarget;
  readonly created_at: string;
}

/** Dados p/ salvar um mockup no backend local (cena já codificada em WebP). */
export interface LocalMockupInput {
  readonly name: string;
  readonly bytes: ArrayBuffer;
  readonly mime: string;
  readonly sceneWidth: number;
  readonly sceneHeight: number;
  readonly target: LocalSceneTarget;
}

/** Patch de mockup: sempre o alvo; opcionalmente uma cena nova (bytes). */
export interface LocalMockupPatch {
  readonly target: LocalSceneTarget;
  readonly scene?: {
    readonly bytes: ArrayBuffer;
    readonly mime: string;
    readonly width: number;
    readonly height: number;
  } | null;
}

/** Linha de moldura como o SQLite devolve. */
export interface LocalFrameRow {
  readonly id: string;
  readonly name: string;
  readonly storage_path: string;
  readonly mime: string;
  readonly bytes: number | null;
  readonly width_px: number | null;
  readonly height_px: number | null;
  readonly default_offset_x: number;
  readonly default_offset_y: number;
  readonly default_scale: number;
  readonly default_rotation: number;
  readonly is_composite: number; // 0/1
  readonly created_at: string;
}

/** Linha de camada de moldura (frame_template_layers). */
export interface LocalLayerRow {
  readonly id: string;
  readonly template_id: string;
  readonly position: number;
  readonly storage_path: string;
  readonly offset_x: number;
  readonly offset_y: number;
  readonly scale: number;
  readonly rotation: number;
  readonly source: 'upload' | 'template';
  readonly origin_template_id: string | null;
}

export interface LocalFrameInput {
  readonly name: string;
  readonly bytes: ArrayBuffer;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
}

export interface LocalFramingInput {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scale: number;
  readonly rotation: number;
}

/** Camada p/ gravar numa composição (offset = fração do lado da composição). */
export interface LocalCompositionLayer {
  readonly storagePath: string;
  readonly offset: { readonly x: number; readonly y: number };
  readonly scale: number;
  readonly rotation: number;
  readonly source: 'upload' | 'template';
  readonly originTemplateId?: string | null;
}

export interface LocalCompositionInput {
  readonly templateId: string;
  readonly layers: readonly LocalCompositionLayer[];
  readonly flatBytes: ArrayBuffer;
}

/** API exposta em `window.sb` pelo preload. Cresce a cada serviço migrado. */
export interface LocalBackendApi {
  readonly printSpecs: { list(): Promise<readonly unknown[]> };
  readonly backgrounds: {
    list(): Promise<readonly LocalBackgroundRow[]>;
    save(input: LocalBackgroundInput): Promise<LocalBackgroundRow>;
    remove(id: string): Promise<void>;
  };
  readonly mockups: {
    list(): Promise<readonly LocalMockupRow[]>;
    save(input: LocalMockupInput): Promise<LocalMockupRow>;
    update(id: string, patch: LocalMockupPatch): Promise<LocalMockupRow>;
    remove(id: string): Promise<void>;
  };
  readonly frames: {
    list(): Promise<readonly LocalFrameRow[]>;
    save(input: LocalFrameInput): Promise<LocalFrameRow>;
    updateFraming(id: string, framing: LocalFramingInput): Promise<LocalFrameRow>;
    listLayers(templateId: string): Promise<readonly LocalLayerRow[]>;
    saveComposition(input: LocalCompositionInput): Promise<LocalFrameRow>;
    copyPng(src: string): Promise<string>;
    remove(id: string): Promise<void>;
  };
  readonly media: { read(name: string): Promise<Uint8Array | null> };
}

/** A API local se rodando no Electron (preload), senão `null` (modo web). */
export function localBackend(): LocalBackendApi | null {
  return (globalThis as unknown as { sb?: LocalBackendApi }).sb ?? null;
}
