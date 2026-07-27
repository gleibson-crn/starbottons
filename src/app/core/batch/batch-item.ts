import { DEFAULT_FILTERS, DEFAULT_TRANSFORM } from '../../shared/types';
import type {
  EditorTransform,
  ImageFilters,
  UploadRecord,
} from '../../shared/types';
import type { ImageProbe } from '../upload';
import { BATCH_EDITOR_SIDE } from './batch.constants';
import {
  computePerSizeDpi,
  computePerSizeTier,
  defaultSizes,
} from './batch-gating';
import {
  IDLE_ART,
  type ArtState,
  type BatchItem,
  type BottonSize,
} from './batch.types';

const ZERO_DPI: Record<BottonSize, number> = { 32: 0, 44: 0, 58: 0 };

/** Nome do arquivo sem a extensão (pré-preenche o campo "Nome"). */
export function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** Item recém-criado, ainda em upload (sem dimensões/geração). */
export function newUploadingItem(id: string, file: File): BatchItem {
  return {
    id,
    name: baseName(file.name),
    upload: null,
    fileName: file.name,
    previewUrl: '',
    width: 0,
    height: 0,
    transform: DEFAULT_TRANSFORM,
    editorSide: BATCH_EDITOR_SIDE,
    filters: DEFAULT_FILTERS,
    generationUpload: null,
    selectedSizes: new Set(),
    perSizeDpi: { ...ZERO_DPI },
    perSizeTier: computePerSizeTier(ZERO_DPI),
    arts: {},
    uploadError: null,
  };
}

/** Aplica o upload concluído: dimensões, DPI/tier por tamanho e seleção default. */
export function withUpload(
  item: BatchItem,
  upload: UploadRecord,
  probe: ImageProbe,
  budget: number,
): BatchItem {
  const perSizeDpi = computePerSizeDpi(probe.width, probe.height, DEFAULT_TRANSFORM.scale);
  const perSizeTier = computePerSizeTier(perSizeDpi);
  return {
    ...item,
    upload,
    previewUrl: probe.previewUrl,
    width: probe.width,
    height: probe.height,
    perSizeDpi,
    perSizeTier,
    selectedSizes: defaultSizes(perSizeTier, budget),
    uploadError: null,
  };
}

export function withUploadError(item: BatchItem, message: string): BatchItem {
  return { ...item, uploadError: message };
}

export function withName(item: BatchItem, name: string): BatchItem {
  return { ...item, name };
}

/** Marca/desmarca um tamanho (respeita bloqueio por tier e teto do lote). */
export function withToggledSize(
  item: BatchItem,
  size: BottonSize,
  capped: boolean,
): BatchItem {
  const next = new Set(item.selectedSizes);
  if (next.has(size)) {
    next.delete(size);
  } else if (item.perSizeTier[size] !== 'blocked' && !capped) {
    next.add(size);
  }
  return { ...item, selectedSizes: next };
}

/**
 * Novos filtros de tratamento. Invalida o upload tratado em cache
 * (`generationUpload`), pois ele reflete os filtros anteriores e precisa ser
 * remateriazado na próxima geração.
 */
export function withFilters(
  item: BatchItem,
  filters: ImageFilters,
): BatchItem {
  return { ...item, filters, generationUpload: null };
}

/** Guarda o upload tratado full-res (reuso por todos os tamanhos do item). */
export function withGenerationUpload(
  item: BatchItem,
  upload: UploadRecord,
): BatchItem {
  return { ...item, generationUpload: upload };
}

/** Novo enquadramento: recalcula DPI/tier e solta tamanhos que ficaram 🔴. */
export function withTransform(
  item: BatchItem,
  transform: EditorTransform,
  editorSide: number,
): BatchItem {
  const perSizeDpi = computePerSizeDpi(item.width, item.height, transform.scale);
  const perSizeTier = computePerSizeTier(perSizeDpi);
  const selectedSizes = new Set(
    [...item.selectedSizes].filter((s) => perSizeTier[s] !== 'blocked'),
  );
  return { ...item, transform, editorSide, perSizeDpi, perSizeTier, selectedSizes };
}

/** Patch imutável do estado de UMA arte (tamanho) do item. */
export function withArt(
  item: BatchItem,
  size: BottonSize,
  patch: Partial<ArtState>,
): BatchItem {
  const current = item.arts[size] ?? IDLE_ART;
  return { ...item, arts: { ...item.arts, [size]: { ...current, ...patch } } };
}
