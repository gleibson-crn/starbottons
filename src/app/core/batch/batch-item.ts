import {
  DEFAULT_FILTERS,
  DEFAULT_STYLE_EFFECT,
  DEFAULT_TRANSFORM,
} from '../../shared/types';
import type {
  EditorTransform,
  ImageFilters,
  StyleEffect,
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
    style: DEFAULT_STYLE_EFFECT,
    generationUpload: null,
    aiStyled: false,
    cutout: false,
    cutoutUpload: null,
    selectedSizes: new Set(),
    perSizeDpi: { ...ZERO_DPI },
    perSizeTier: computePerSizeTier(ZERO_DPI),
    arts: {},
    uploadError: null,
    seqLabel: '',
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

/** Zera a falha de upload — usado ao REENVIAR (o card volta a "Enviando…"). */
export function clearUploadError(item: BatchItem): BatchItem {
  return item.uploadError === null ? item : { ...item, uploadError: null };
}

/** Sanitiza o número (senha): só dígitos, no máx. 8. */
export function sanitizeSeqLabel(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8);
}

export function withSeqLabel(item: BatchItem, value: string): BatchItem {
  return { ...item, seqLabel: sanitizeSeqLabel(value) };
}

export function withName(item: BatchItem, name: string): BatchItem {
  return { ...item, name };
}

/**
 * Marca/desmarca um tamanho. Só o teto do lote (`capped`) impede marcar; o tier
 * 🔴 NÃO trava mais (o usuário pode gerar sob aviso forte — ver `resolutionTier`).
 */
export function withToggledSize(
  item: BatchItem,
  size: BottonSize,
  capped: boolean,
): BatchItem {
  const next = new Set(item.selectedSizes);
  if (next.has(size)) {
    next.delete(size);
  } else if (!capped) {
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
  return { ...item, filters, generationUpload: null, aiStyled: false };
}

/**
 * Novo efeito de estilo (ADR-019). Como `withFilters`, invalida o upload
 * tratado em cache (`generationUpload`) — ele reflete o estilo anterior e será
 * remateriazado (com o estilo baked full-res) na próxima geração.
 */
export function withStyle(
  item: BatchItem,
  style: StyleEffect,
): BatchItem {
  return { ...item, style, generationUpload: null, aiStyled: false };
}

/** Guarda o upload tratado full-res (reuso por todos os tamanhos do item). */
export function withGenerationUpload(
  item: BatchItem,
  upload: UploadRecord,
): BatchItem {
  return { ...item, generationUpload: upload };
}

/**
 * "Remover fundo": grava (ou, com `null`, desfaz) o recorte. O original e os
 * filtros/estilo permanecem; só invalida o tratado em cache (`generationUpload`),
 * que precisa ser re-materializado a partir do recorte (ou do original, ao desfazer).
 */
export function withCutout(
  item: BatchItem,
  upload: UploadRecord | null,
): BatchItem {
  return {
    ...item,
    cutout: upload !== null,
    cutoutUpload: upload,
    generationUpload: null,
    aiStyled: false,
  };
}

/**
 * Trilha 2 (ADR-021) — grava o resultado da estilização por IA: o
 * `generationUpload` já é o PNG tratado full-res ESTILIZADO (materializado pelo
 * diálogo), então marca `aiStyled` e zera filtros/estilo locais (a estilização
 * substitui o tratamento por pixel). `needsTreated` passa a valer sempre, e a
 * geração usa este upload direto — sem reprocessar.
 */
export function withAiStyle(
  item: BatchItem,
  upload: UploadRecord,
): BatchItem {
  return {
    ...item,
    generationUpload: upload,
    aiStyled: true,
    cutout: false,
    cutoutUpload: null,
    filters: DEFAULT_FILTERS,
    style: DEFAULT_STYLE_EFFECT,
  };
}

/**
 * Novo enquadramento: recalcula DPI/tier por tamanho. A seleção é PRESERVADA —
 * mesmo que um tamanho caia para 🔴 ao ampliar, ele permanece marcado (só passa
 * a exibir o aviso forte), coerente com a política de "gerar sob responsabilidade".
 */
export function withTransform(
  item: BatchItem,
  transform: EditorTransform,
  editorSide: number,
): BatchItem {
  const perSizeDpi = computePerSizeDpi(item.width, item.height, transform.scale);
  const perSizeTier = computePerSizeTier(perSizeDpi);
  return { ...item, transform, editorSide, perSizeDpi, perSizeTier };
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
