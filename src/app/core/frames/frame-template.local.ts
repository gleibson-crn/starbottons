// Mapeamentos do backend local (ADR-033) para as molduras. Extraído do serviço
// para mantê-lo abaixo do limite de linhas. Funções puras: recebem a API local
// (`window.sb`) e as linhas do SQLite, devolvem os tipos do app.
import type { LocalBackendApi, LocalFrameRow, LocalLayerRow } from '../local-backend/local-api';
import type { CompositionLayer, FrameTemplate } from './frame-template.service';

/** Lê os bytes do PNG local e devolve um blob URL (file:// seria bloqueado). */
export async function localThumb(local: LocalBackendApi, name: string): Promise<string | null> {
  const bytes = await local.media.read(name);
  if (!bytes) {
    return null;
  }
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
}

/** Linha de moldura do SQLite → FrameTemplate do app (com thumb local). */
export async function frameRowToTemplate(
  local: LocalBackendApi,
  row: LocalFrameRow,
): Promise<FrameTemplate> {
  return {
    id: row.id,
    name: row.name,
    storagePath: row.storage_path,
    mime: row.mime,
    width: row.width_px ?? 0,
    height: row.height_px ?? 0,
    createdAt: row.created_at,
    thumbUrl: await localThumb(local, row.storage_path),
    defaultFraming: {
      offset: { x: row.default_offset_x, y: row.default_offset_y },
      scale: row.default_scale,
      rotation: row.default_rotation,
    },
    isComposite: row.is_composite === 1,
  };
}

/** Linha de camada → CompositionLayer (com URL local). */
export async function layerRowToComposition(
  local: LocalBackendApi,
  row: LocalLayerRow,
): Promise<CompositionLayer> {
  return {
    id: row.id,
    storagePath: row.storage_path,
    url: (await localThumb(local, row.storage_path)) ?? '',
    offset: { x: row.offset_x, y: row.offset_y },
    scale: row.scale,
    rotation: row.rotation,
    source: row.source,
    originTemplateId: row.origin_template_id,
  };
}
