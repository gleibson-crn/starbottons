import type { BottonSize } from '../../core/print';

/**
 * Uma linha da folha em montagem: uma arte (do LOTE ou AVULSA) com sua
 * quantidade. `origin` distingue a fonte — artes de lote reusam a URL do
 * BatchStore (não revogar); artes avulsas usam um object URL client-side que
 * PRECISA ser revogado ao remover a linha / destruir a página.
 */
export interface SheetLine {
  readonly key: string;
  readonly url: string;
  readonly name: string;
  readonly sizeMm: BottonSize;
  readonly quantity: number;
  readonly origin: 'ready' | 'avulso';
}

/** Quantidade mínima válida de uma arte na folha. */
export const MIN_QTY = 1;
/** Quantidade máxima válida de uma arte na folha. */
export const MAX_QTY = 999;

/** Limita a quantidade ao intervalo válido (1..999); NaN vira o mínimo. */
export function clampQty(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_QTY;
  }
  return Math.min(MAX_QTY, Math.max(MIN_QTY, Math.floor(value)));
}

/** Dados mínimos de uma arte do lote para virar linha da folha. */
export interface ReadyLineInput {
  readonly key: string;
  readonly url: string;
  readonly name: string;
  readonly sizeMm: BottonSize;
}

/** Adiciona/soma uma arte do LOTE à lista (mesma arte não duplica a linha). */
export function mergeReadyLine(
  lines: readonly SheetLine[],
  art: ReadyLineInput,
  qty: number,
): SheetLine[] {
  if (lines.some((l) => l.key === art.key)) {
    return lines.map((l) =>
      l.key === art.key ? { ...l, quantity: clampQty(l.quantity + qty) } : l,
    );
  }
  return [
    ...lines,
    {
      key: art.key,
      url: art.url,
      name: art.name,
      sizeMm: art.sizeMm,
      quantity: qty,
      origin: 'ready',
    },
  ];
}
