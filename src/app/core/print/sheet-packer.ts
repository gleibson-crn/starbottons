import { fallbackSpec } from '../../shared/utils';
import type { BottonSize } from '../batch/batch.types';

/** Tamanho nominal do botton (mm) — reusa o do domínio de lote. */
export type { BottonSize };

/** Uma arte pronta que o usuário quer imprimir N vezes na folha. */
export interface SheetInput {
  readonly id: string;
  readonly url: string;
  readonly sizeMm: BottonSize;
  readonly quantity: number;
}

/** Geometria de uma página física (mm). */
export interface PageSpec {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly marginMm: number;
  readonly gapMm: number;
}

/** Folha A4 retrato: margem de segurança 5mm, folga entre peças 4mm. */
export const A4: PageSpec = { widthMm: 210, heightMm: 297, marginMm: 5, gapMm: 4 };

/** Uma peça já posicionada: canto do quadrado em (xMm,yMm), lado = artMm. */
export interface PlacedPiece {
  readonly url: string;
  readonly sizeMm: BottonSize;
  readonly artMm: number;
  readonly xMm: number;
  readonly yMm: number;
}

/** Resultado do empacotamento: páginas, total de peças e aproveitamento (%). */
export interface PackedSheet {
  readonly pages: PlacedPiece[][];
  readonly totalPieces: number;
  readonly utilizationPct: number;
}

interface Piece {
  readonly url: string;
  readonly sizeMm: BottonSize;
  readonly artMm: number;
}

/** Cursor mutável do algoritmo de shelf (varre a folha da esq→dir, cima→baixo). */
interface Cursor {
  pages: PlacedPiece[][];
  current: PlacedPiece[];
  x: number;
  y: number;
  rowHeightMm: number;
  circleAreaMm2: number;
}

/**
 * Diâmetro FÍSICO impresso pela golden matrix (arte com sangria): 32→44, 44→54,
 * 58→70 mm. Fonte única: `fallbackSpec('round', size).artDiameterMm`.
 */
function artMmFor(size: BottonSize): number {
  const spec = fallbackSpec('round', size);
  if (!spec) {
    throw new Error(`Sem print_spec de fallback para ${size}mm.`);
  }
  return spec.artDiameterMm;
}

/** Expande cada item em `quantity` peças (quantidade < 1 é ignorada). */
function expand(items: readonly SheetInput[]): Piece[] {
  const out: Piece[] = [];
  for (const item of items) {
    const qty = Math.max(0, Math.floor(item.quantity));
    const artMm = artMmFor(item.sizeMm);
    for (let i = 0; i < qty; i++) {
      out.push({ url: item.url, sizeMm: item.sizeMm, artMm });
    }
  }
  return out;
}

/** Posiciona UMA peça, quebrando fileira/página quando não couber. */
function place(
  cursor: Cursor,
  piece: Piece,
  page: PageSpec,
  usableW: number,
  usableH: number,
): void {
  const rightEdge = page.marginMm + usableW;
  const bottomEdge = page.marginMm + usableH;
  if (cursor.x > page.marginMm && cursor.x + piece.artMm > rightEdge) {
    cursor.x = page.marginMm;
    cursor.y += cursor.rowHeightMm;
    cursor.rowHeightMm = 0;
  }
  if (cursor.current.length > 0 && cursor.y + piece.artMm > bottomEdge) {
    cursor.pages.push(cursor.current);
    cursor.current = [];
    cursor.x = page.marginMm;
    cursor.y = page.marginMm;
    cursor.rowHeightMm = 0;
  }
  cursor.current.push({
    url: piece.url,
    sizeMm: piece.sizeMm,
    artMm: piece.artMm,
    xMm: cursor.x,
    yMm: cursor.y,
  });
  const half = piece.artMm / 2;
  cursor.circleAreaMm2 += Math.PI * half * half;
  cursor.x += piece.artMm + page.gapMm;
  cursor.rowHeightMm = Math.max(cursor.rowHeightMm, piece.artMm + page.gapMm);
}

/**
 * Empacota artes numa (ou mais) folha(s) via **shelf First-Fit-Decreasing**:
 * expande por quantidade, ordena por `artMm` DESC e preenche em fileiras dentro
 * da área útil; a fileira quebra na largura, a página quebra na altura.
 * Determinístico. Invariantes: sem sobreposição (respeita `gapMm`), nada fora
 * da margem e overflow gera novas páginas.
 */
export function packSheet(items: readonly SheetInput[], page: PageSpec = A4): PackedSheet {
  const pieces = expand(items).sort((a, b) => b.artMm - a.artMm);
  if (pieces.length === 0) {
    return { pages: [], totalPieces: 0, utilizationPct: 0 };
  }
  const usableW = page.widthMm - 2 * page.marginMm;
  const usableH = page.heightMm - 2 * page.marginMm;
  const cursor: Cursor = {
    pages: [],
    current: [],
    x: page.marginMm,
    y: page.marginMm,
    rowHeightMm: 0,
    circleAreaMm2: 0,
  };
  for (const piece of pieces) {
    place(cursor, piece, page, usableW, usableH);
  }
  if (cursor.current.length > 0) {
    cursor.pages.push(cursor.current);
  }
  const usableArea = usableW * usableH * cursor.pages.length;
  const utilizationPct = usableArea > 0
    ? Math.round((cursor.circleAreaMm2 / usableArea) * 100)
    : 0;
  return { pages: cursor.pages, totalPieces: pieces.length, utilizationPct };
}
