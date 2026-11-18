import { TREATED_MAX_SIDE } from '../upload';
import type { PrintSpec, UploadRecord } from '../../shared/types';
import { DEFAULT_STYLE_EFFECT, isDefaultFilters, isDefaultStyle } from '../../shared/types';
import { fallbackSpec } from '../../shared/utils';
import type { BatchItem, BottonSize } from './batch.types';

export function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function roundSpec(size: BottonSize): PrintSpec {
  const spec = fallbackSpec('round', size);
  if (!spec) {
    throw new Error(`Sem print_spec para ${size}mm.`);
  }
  return spec;
}

/**
 * `true` quando o item precisa de um upload TRATADO (Abordagem A): filtros
 * tonais ativos, efeito de estilo (ADR-019) OU imagem MAIOR que o teto de
 * geração. Este último é CRÍTICO: sem estilo/filtro o original iria direto à
 * Edge, e uma foto grande (ex.: 24MP) estoura o CPU hard limit do worker (HTTP
 * 546). Nesse caso o bake tratado só REDUZ a resolução (filtro/estilo neutros)
 * a `TREATED_MAX_SIDE`. Neutro E dentro do teto = usa o upload original direto.
 */
export function needsTreated(item: BatchItem): boolean {
  return (
    !!item.aiStyled ||
    !!item.cutout ||
    !isDefaultFilters(item.filters) ||
    !isDefaultStyle(item.style ?? DEFAULT_STYLE_EFFECT) ||
    Math.max(item.width, item.height) > TREATED_MAX_SIDE
  );
}

/**
 * Fonte da geração (Abordagem A): sem tratamento → upload ORIGINAL; com
 * filtros/estilo/redução → o upload TRATADO full-res já materializado. Lança se
 * o tratamento era necessário mas falhou.
 */
export function sourceUpload(item: BatchItem, original: UploadRecord): UploadRecord {
  if (!needsTreated(item)) {
    return original;
  }
  if (item.generationUpload) {
    return item.generationUpload;
  }
  throw new Error('Falha ao aplicar o tratamento à imagem.');
}

/** URL da imagem a tratar: o recorte ("Remover fundo") quando houver, senão o original. */
export function treatSourceUrl(item: BatchItem): string {
  return item.cutout && item.cutoutUpload?.previewUrl
    ? item.cutoutUpload.previewUrl
    : item.previewUrl;
}

/** Unidade de trabalho de geração: item × tamanho. */
export interface PendingJob {
  readonly itemId: string;
  readonly size: BottonSize;
}

/** Senhas (não vazias) que aparecem em mais de um item. */
export function duplicateLabels(items: readonly BatchItem[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const { seqLabel } of items) {
    if (seqLabel !== '') {
      (seen.has(seqLabel) ? dup : seen).add(seqLabel);
    }
  }
  return dup;
}

/** Trabalhos ainda por fazer (nome válido, upload feito, arte não pronta/gerando). */
export function pendingJobsOf(
  items: readonly BatchItem[],
  nameOk: (name: string) => boolean,
): PendingJob[] {
  const out: PendingJob[] = [];
  for (const item of items) {
    if (!item.upload || !nameOk(item.name)) {
      continue;
    }
    for (const size of item.selectedSizes) {
      const status = item.arts[size]?.status ?? 'idle';
      if (status !== 'ready' && status !== 'generating') {
        out.push({ itemId: item.id, size });
      }
    }
  }
  return out;
}
