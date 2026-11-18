import { runPool } from '../../shared/utils';
import { BOTTON_SIZES, IDLE_ART, type ArtState, type BatchItem, type BottonSize } from './batch.types';

/** Subconjunto do `GenerationGateway` usado na reidratação (fácil de fakear). */
export interface RestoreGateway {
  fetchAssets(jobId: string): Promise<{ kind: string; storagePath: string }[]>;
  signRender(storagePath: string): Promise<string | null>;
  signUpload(storagePath: string): Promise<string | null>;
}

export interface RestoreDeps {
  readonly gateway: RestoreGateway;
  readonly getBlob: (id: string) => Promise<Blob | null>;
}

export interface RestoreResult {
  readonly items: BatchItem[];
  /** Files recuperados (itens cujo upload não concluiu) — habilitam o "Reenviar". */
  readonly files: Map<string, File>;
}

const RESTORE_CONCURRENCY = 4;

/** Re-assina a arte `ready`; qualquer falha/ausência → `idle` (jobId null). */
async function resignArt(jobId: string, gateway: RestoreGateway): Promise<ArtState> {
  try {
    const assets = await gateway.fetchAssets(jobId);
    const asset = assets.find((a) => a.kind === 'print_png');
    const url = asset ? await gateway.signRender(asset.storagePath) : null;
    return url
      ? { status: 'ready', printPngUrl: url, jobId, errorMessage: null }
      : IDLE_ART;
  } catch {
    return IDLE_ART;
  }
}

async function resignArts(item: BatchItem, gateway: RestoreGateway): Promise<BatchItem['arts']> {
  const sizes = BOTTON_SIZES.filter((s) => item.arts[s]?.jobId);
  const states = await Promise.all(
    sizes.map((s) => resignArt(item.arts[s]?.jobId as string, gateway)),
  );
  const arts: Partial<Record<BottonSize, ArtState>> = {};
  sizes.forEach((s, i) => (arts[s] = states[i]));
  return arts;
}

async function safeSign(path: string, gateway: RestoreGateway): Promise<string> {
  try {
    return (await gateway.signUpload(path)) ?? '';
  } catch {
    return '';
  }
}

async function safeBlob(id: string, deps: RestoreDeps): Promise<Blob | null> {
  try {
    return await deps.getBlob(id);
  } catch {
    return null;
  }
}

interface Restored {
  readonly item: BatchItem;
  readonly file?: File;
}

async function restoreOne(item: BatchItem, deps: RestoreDeps): Promise<Restored | null> {
  if (!item.upload) {
    const blob = await safeBlob(item.id, deps);
    if (!blob) {
      return null; // upload não concluiu e não há Blob: nada a recuperar
    }
    const file = new File([blob], item.fileName, { type: blob.type });
    return { item: { ...item, previewUrl: URL.createObjectURL(blob) }, file };
  }
  const [previewUrl, arts] = await Promise.all([
    safeSign(item.upload.path, deps.gateway),
    resignArts(item, deps.gateway),
  ]);
  const cutoutUpload = item.cutoutUpload
    ? { ...item.cutoutUpload, previewUrl: await safeSign(item.cutoutUpload.path, deps.gateway) }
    : null;
  return {
    item: { ...item, previewUrl, upload: { ...item.upload, previewUrl }, cutoutUpload, arts },
  };
}

/**
 * Reidrata os itens: preview (signed URL do `uploads` ou blob) e re-assina cada
 * arte `ready` (conc. 4). Nunca lança: o que falhar vira `idle` ("regenerar").
 */
export async function restoreItems(
  items: readonly BatchItem[],
  deps: RestoreDeps,
): Promise<RestoreResult> {
  const results = await runPool(
    items.map((item) => () => restoreOne(item, deps)),
    { concurrency: RESTORE_CONCURRENCY },
  );
  const out: BatchItem[] = [];
  const files = new Map<string, File>();
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      out.push(r.value.item);
      if (r.value.file) {
        files.set(r.value.item.id, r.value.file);
      }
    }
  }
  return { items: out, files };
}
