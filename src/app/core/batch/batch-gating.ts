import type { ResolutionTier } from '../../shared/types';
import {
  effectiveDpi,
  fallbackSpec,
  resolutionTier,
} from '../../shared/utils';
import { BOTTON_SIZES, type BatchItem, type BottonSize, type ItemStatus } from './batch.types';

type SizeMap<T> = Record<BottonSize, T>;

function specFor(size: BottonSize) {
  const spec = fallbackSpec('round', size);
  if (!spec) {
    throw new Error(`Sem print_spec de fallback para ${size}mm.`);
  }
  return spec;
}

/** DPI efetivo por tamanho no enquadramento atual (scale do transform). */
export function computePerSizeDpi(
  width: number,
  height: number,
  scale: number,
): SizeMap<number> {
  const out = {} as SizeMap<number>;
  for (const size of BOTTON_SIZES) {
    out[size] = effectiveDpi({
      naturalWidth: width,
      naturalHeight: height,
      scale,
      spec: specFor(size),
    });
  }
  return out;
}

/** Faixa (semáforo) por tamanho a partir do DPI. */
export function computePerSizeTier(dpi: SizeMap<number>): SizeMap<ResolutionTier> {
  const out = {} as SizeMap<ResolutionTier>;
  for (const size of BOTTON_SIZES) {
    out[size] = resolutionTier(dpi[size]);
  }
  return out;
}

/**
 * Tamanhos que entram por PADRÃO: os de boa resolução (🟢/🟡), respeitando o
 * orçamento. Tamanhos 🔴 não entram sozinhos — o usuário marca deliberadamente
 * (sob aviso forte); ver `resolutionTier`.
 */
export function defaultSizes(
  tier: SizeMap<ResolutionTier>,
  budget: number,
): Set<BottonSize> {
  const selected = new Set<BottonSize>();
  for (const size of BOTTON_SIZES) {
    if (tier[size] !== 'blocked' && selected.size < budget) {
      selected.add(size);
    }
  }
  return selected;
}

/** Maior tamanho selecionado (a arte mais exigente); `null` se nada marcado. */
export function largestSelectedSize(item: BatchItem): BottonSize | null {
  const selected = [...item.selectedSizes].sort((a, b) => b - a);
  return selected[0] ?? null;
}

/**
 * `true` se o item existe e tem ≥1 arte GERADA com sucesso (`status === 'ready'`).
 * Pré-requisito para "Aplicar em cenário" (Mockup Contextual, ADR-017).
 */
export function hasReadyArt(item: BatchItem | null | undefined): boolean {
  return !!item && BOTTON_SIZES.some((s) => item.arts[s]?.status === 'ready');
}

/**
 * Maior tamanho com arte PRONTA (define a resolução do sprite fiel do mockup);
 * `null` se nenhuma arte está pronta. `BOTTON_SIZES` é crescente → último = maior.
 */
export function largestReadySize(item: BatchItem): BottonSize | null {
  const ready = BOTTON_SIZES.filter((s) => item.arts[s]?.status === 'ready');
  return ready.length > 0 ? ready[ready.length - 1] : null;
}

/**
 * DPI do PIOR tier entre os tamanhos SELECIONADOS = o do MAIOR tamanho
 * selecionado (arte maior → menor densidade). `null` se nada selecionado.
 */
export function worstSelectedDpi(item: BatchItem): number | null {
  const largest = largestSelectedSize(item);
  return largest === null ? null : item.perSizeDpi[largest];
}

function countStatuses(statuses: readonly string[]): {
  generating: number;
  idle: number;
  ready: number;
  failed: number;
} {
  const acc = { generating: 0, idle: 0, ready: 0, failed: 0 };
  for (const s of statuses) {
    if (s === 'generating') acc.generating++;
    else if (s === 'ready') acc.ready++;
    else if (s === 'failed') acc.failed++;
    else acc.idle++;
  }
  return acc;
}

/** Deriva o status do item a partir do upload e das artes selecionadas. */
export function deriveItemStatus(item: BatchItem): ItemStatus {
  if (!item.upload) {
    return item.uploadError ? 'error' : 'uploading';
  }
  const statuses = [...item.selectedSizes].map((s) => item.arts[s]?.status ?? 'idle');
  if (statuses.length === 0) {
    return 'ready';
  }
  const c = countStatuses(statuses);
  if (c.generating > 0) return 'generating';
  if (c.idle === statuses.length) return 'ready';
  if (c.ready === statuses.length) return 'done';
  if (c.failed === statuses.length) return 'failed';
  return 'partial';
}
