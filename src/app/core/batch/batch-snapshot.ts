import type {
  EditorTransform,
  ImageFilters,
  StyleEffect,
  UploadRecord,
} from '../../shared/types';
import { DEFAULT_FILTERS, DEFAULT_STYLE_EFFECT } from '../../shared/types';
import { computePerSizeDpi, computePerSizeTier } from './batch-gating';
import { BOTTON_SIZES, type ArtState, type BatchItem, type BottonSize } from './batch.types';

/** Validade do snapshot salvo: 7 dias. */
export const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const UPLOAD_INTERRUPTED_MESSAGE = 'Envio interrompido. Reenvie a imagem.';

const ZERO_DPI: Record<BottonSize, number> = { 32: 0, 44: 0, 58: 0 };

/** Upload sem o `previewUrl` (object URL não sobrevive ao reload). */
export type PersistedUpload = Omit<UploadRecord, 'previewUrl'>;

/** Só artes `ready` com `jobId` são persistidas (re-assinadas ao restaurar). */
export interface PersistedArt {
  readonly status: 'ready';
  readonly jobId: string;
}

export interface PersistedItem {
  readonly id: string;
  readonly name: string;
  readonly fileName: string;
  readonly width: number;
  readonly height: number;
  readonly transform: EditorTransform;
  readonly editorSide: number;
  readonly filters: ImageFilters;
  readonly style: StyleEffect;
  readonly selectedSizes: BottonSize[];
  readonly upload: PersistedUpload | null;
  /** "Remover fundo": upload do recorte (PNG com alfa), quando houver. */
  readonly cutoutUpload?: PersistedUpload | null;
  readonly arts: Partial<Record<BottonSize, PersistedArt>>;
  readonly seqLabel?: string;
  /** Legado (ADR-028): número automático; migrado para `seqLabel`. */
  readonly sequenceNumber?: number;
}

export interface Snapshot {
  readonly v: 1;
  readonly batchId: string;
  readonly savedAt: number;
  readonly userId: string;
  readonly items: PersistedItem[];
  /** Lote numerado (impressão do número na sangria). */
  readonly numbered?: boolean;
}

function persistedArts(item: BatchItem): Partial<Record<BottonSize, PersistedArt>> {
  const out: Partial<Record<BottonSize, PersistedArt>> = {};
  for (const size of BOTTON_SIZES) {
    const art = item.arts[size];
    if (art?.status === 'ready' && art.jobId) {
      out[size] = { status: 'ready', jobId: art.jobId };
    }
  }
  return out;
}

function persistedUpload(upload: UploadRecord | null): PersistedUpload | null {
  if (!upload) {
    return null;
  }
  const { id, path, fileName, width, height } = upload;
  return { id, path, fileName, width, height };
}

function toPersistedItem(item: BatchItem): PersistedItem {
  return {
    id: item.id,
    name: item.name,
    fileName: item.fileName,
    width: item.width,
    height: item.height,
    transform: item.transform,
    editorSide: item.editorSide,
    filters: item.filters,
    style: item.style ?? DEFAULT_STYLE_EFFECT,
    selectedSizes: [...item.selectedSizes],
    upload: persistedUpload(item.upload),
    ...(item.cutout && item.cutoutUpload
      ? { cutoutUpload: persistedUpload(item.cutoutUpload) }
      : {}),
    arts: persistedArts(item),
    seqLabel: item.seqLabel,
  };
}

/** Serializa o lote num JSON leve (sem URLs, sem Blobs, sem estado derivado). */
export function toSnapshot(
  items: readonly BatchItem[],
  batchId: string,
  userId: string,
  now: number = Date.now(),
  numbered = false,
): Snapshot {
  return {
    v: 1,
    batchId,
    savedAt: now,
    userId,
    items: items.map(toPersistedItem),
    numbered,
  };
}

/** Valida um valor lido do storage; `null` se vencido, de outro usuário ou inválido. */
export function parseSnapshot(raw: unknown, userId: string, now: number = Date.now()): Snapshot | null {
  const s = raw as Partial<Snapshot> | null | undefined;
  const valid =
    !!s &&
    s.v === 1 &&
    typeof s.batchId === 'string' &&
    typeof s.savedAt === 'number' &&
    Array.isArray(s.items) &&
    s.items.length > 0;
  if (!valid || s.userId !== userId || now - s.savedAt > SNAPSHOT_TTL_MS) {
    return null;
  }
  return s as Snapshot;
}

function restoredArts(p: PersistedItem): Partial<Record<BottonSize, ArtState>> {
  const out: Partial<Record<BottonSize, ArtState>> = {};
  for (const size of BOTTON_SIZES) {
    const art = p.arts?.[size];
    if (art?.jobId) {
      // `idle` com jobId: o re-sign promove a `ready`; falha limpa o jobId.
      out[size] = { status: 'idle', printPngUrl: null, jobId: art.jobId, errorMessage: null };
    }
  }
  return out;
}

/** Reconstrói um `BatchItem` (sem previewUrl; DPI/tier recalculados). */
export function fromPersistedItem(p: PersistedItem): BatchItem {
  const hasDims = p.width > 0 && p.height > 0;
  const perSizeDpi = hasDims
    ? computePerSizeDpi(p.width, p.height, p.transform.scale)
    : { ...ZERO_DPI };
  return {
    id: p.id,
    name: p.name,
    upload: p.upload ? { ...p.upload, previewUrl: '' } : null,
    fileName: p.fileName,
    previewUrl: '',
    width: p.width,
    height: p.height,
    transform: p.transform,
    editorSide: p.editorSide,
    filters: p.filters ?? DEFAULT_FILTERS,
    style: p.style ?? DEFAULT_STYLE_EFFECT,
    generationUpload: null,
    aiStyled: false,
    cutout: !!p.cutoutUpload,
    cutoutUpload: p.cutoutUpload ? { ...p.cutoutUpload, previewUrl: '' } : null,
    selectedSizes: new Set(p.selectedSizes.filter((s) => BOTTON_SIZES.includes(s))),
    perSizeDpi,
    perSizeTier: computePerSizeTier(perSizeDpi),
    arts: restoredArts(p),
    uploadError: p.upload ? null : UPLOAD_INTERRUPTED_MESSAGE,
    seqLabel: p.seqLabel ?? String(p.sequenceNumber ?? ''),
  };
}

export function fromSnapshot(snapshot: Snapshot): BatchItem[] {
  return snapshot.items.map((p) => fromPersistedItem(p));
}

/** Resumo para o diálogo de retomada. */
export function summarize(snapshot: Snapshot): { total: number; ready: number } {
  let ready = 0;
  for (const item of snapshot.items) {
    ready += Object.keys(item.arts ?? {}).length;
  }
  return { total: snapshot.items.length, ready };
}
