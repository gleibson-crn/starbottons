import { fallbackSpec } from '../../shared/utils';
import type { BottonSize } from '../batch/batch.types';

/** Tamanho nominal do botton (mm) — reusa o do domínio de lote. */
export type { BottonSize };

/**
 * Forma da peça. Hoje só `circle`; estrela/coração/quadrado/retângulo entram
 * DEPOIS só provendo bbox + colisão (ver `SHAPE_GEOMETRY`), sem tocar em `packSheet`.
 */
export type ShapeKind = 'circle';

/** Uma arte pronta que o usuário quer imprimir N vezes na folha. */
export interface SheetInput {
  readonly id: string;
  readonly url: string;
  readonly sizeMm: BottonSize;
  readonly quantity: number;
  /** Forma da peça (default `circle`). Reservado p/ formas futuras. */
  readonly shape?: ShapeKind;
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

/** Uma peça já posicionada: canto do quadrado (bbox) em (xMm,yMm), lado = artMm. */
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

/** Peça expandida (uma unidade física) antes de posicionar. */
interface Piece {
  readonly url: string;
  readonly sizeMm: BottonSize;
  readonly artMm: number;
  readonly shape: ShapeKind;
}

/**
 * Parâmetros geométricos da forma, SEM posição: bbox (wMm,hMm) agnóstica +
 * campos específicos (ex.: `rMm` do círculo, usado só pela `ShapeGeometry`).
 */
interface ShapeParams {
  readonly kind: ShapeKind;
  readonly wMm: number;
  readonly hMm: number;
  readonly rMm: number;
}

/** Peça posicionada internamente: dados de saída + posição (canto) + geometria. */
interface Slot {
  readonly url: string;
  readonly sizeMm: BottonSize;
  readonly artMm: number;
  readonly xMm: number;
  readonly yMm: number;
  readonly params: ShapeParams;
}

/** Passo da varredura em grade (mm). Poucas peças/página → busca barata. */
const GRID_STEP_MM = 1;

/** Tolerância p/ comparar distâncias ao quadrado (evita ruído de float). */
const EPS = 1e-6;

/**
 * PONTO DE EXTENSÃO de forma. Cada forma fornece: colisão (com folga) entre duas
 * peças posicionadas e a área preenchida (p/ aproveitamento). O laço bottom-left
 * em `packSheet` é genérico — só a colisão/área é específica da forma.
 */
interface ShapeGeometry {
  /**
   * As duas peças, posicionadas pelo canto (x,y) da bbox, colidem (com `gapMm`)?
   * Recebe primitivas (sem alocar objeto por célula da varredura).
   */
  collides(
    ax: number,
    ay: number,
    a: ShapeParams,
    bx: number,
    by: number,
    b: ShapeParams,
    gapMm: number,
  ): boolean;
  /** Área preenchida pela peça (mm²), p/ o cálculo de aproveitamento. */
  area(p: ShapeParams): number;
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

/**
 * Bounding box + parâmetros de colisão de uma forma. Círculo: bbox quadrada =
 * diâmetro, `rMm` = raio. Formas futuras plugam aqui a sua bbox (quadrado/
 * retângulo pela dimensão; estrela/coração pela bbox da forma).
 */
function bboxFor(_shape: ShapeKind, artMm: number): { wMm: number; hMm: number; rMm: number } {
  return { wMm: artMm, hMm: artMm, rMm: artMm / 2 };
}

/** Colisão AABB (bbox+folga): fallback genérico e base p/ quadrado/retângulo. */
function aabbCollides(
  ax: number,
  ay: number,
  a: ShapeParams,
  bx: number,
  by: number,
  b: ShapeParams,
  gapMm: number,
): boolean {
  return (
    ax < bx + b.wMm + gapMm &&
    bx < ax + a.wMm + gapMm &&
    ay < by + b.hMm + gapMm &&
    by < ay + a.hMm + gapMm
  );
}

/**
 * Geometria do CÍRCULO: colisão densa por distância de centros — recupera os
 * cantos do quadrado e os vãos das fileiras. Contra outra forma (par misto)
 * cai no AABB conservador até existir uma colisão dedicada para o par.
 */
const circleGeometry: ShapeGeometry = {
  collides(ax, ay, a, bx, by, b, gapMm) {
    if (b.kind !== 'circle') {
      return aabbCollides(ax, ay, a, bx, by, b, gapMm);
    }
    const minDist = a.rMm + b.rMm + gapMm;
    const dx = ax + a.rMm - (bx + b.rMm);
    const dy = ay + a.rMm - (by + b.rMm);
    return dx * dx + dy * dy < minDist * minDist - EPS;
  },
  area(p) {
    return Math.PI * p.rMm * p.rMm;
  },
};

/**
 * Registro de geometrias por forma — ADICIONE novas formas aqui: inclua o `kind`
 * em `ShapeKind`, sua bbox em `bboxFor` e uma `ShapeGeometry` (AABB p/ quadrado/
 * retângulo; polígono/bbox p/ estrela/coração). `packSheet` NÃO muda.
 */
const SHAPE_GEOMETRY: Record<ShapeKind, ShapeGeometry> = { circle: circleGeometry };

/** Expande cada item em `quantity` peças (quantidade < 1 é ignorada). */
function expand(items: readonly SheetInput[]): Piece[] {
  const out: Piece[] = [];
  for (const item of items) {
    const qty = Math.max(0, Math.floor(item.quantity));
    const artMm = artMmFor(item.sizeMm);
    const shape = item.shape ?? 'circle';
    for (let i = 0; i < qty; i++) {
      out.push({ url: item.url, sizeMm: item.sizeMm, artMm, shape });
    }
  }
  return out;
}

/** Parâmetros geométricos (bbox + colisão) de uma peça. */
function paramsFor(piece: Piece): ShapeParams {
  const b = bboxFor(piece.shape, piece.artMm);
  return { kind: piece.shape, wMm: b.wMm, hMm: b.hMm, rMm: b.rMm };
}

/** O canto (x,y) da bbox colide com ALGUMA peça já colocada na página? */
function collidesAny(
  geom: ShapeGeometry,
  x: number,
  y: number,
  params: ShapeParams,
  placed: readonly Slot[],
  gapMm: number,
): boolean {
  for (const s of placed) {
    if (geom.collides(x, y, params, s.xMm, s.yMm, s.params, gapMm)) {
      return true;
    }
  }
  return false;
}

/**
 * Acha o canto **bottom-left** (menor y, depois menor x) da bbox p/ uma peça de
 * geometria `params` na página, ou `null` se não couber. Varredura em grade de
 * 1mm na área útil, sem alocar por célula. GENÉRICO: só a colisão é da forma.
 */
function findSpot(placed: readonly Slot[], params: ShapeParams, page: PageSpec): { x: number; y: number } | null {
  const minX = page.marginMm;
  const minY = page.marginMm;
  const maxX = page.widthMm - page.marginMm - params.wMm;
  const maxY = page.heightMm - page.marginMm - params.hMm;
  if (maxX < minX - EPS || maxY < minY - EPS) {
    return null;
  }
  const geom = SHAPE_GEOMETRY[params.kind];
  for (let y = minY; y <= maxY + EPS; y += GRID_STEP_MM) {
    for (let x = minX; x <= maxX + EPS; x += GRID_STEP_MM) {
      if (!collidesAny(geom, x, y, params, placed, page.gapMm)) {
        return { x, y };
      }
    }
  }
  return null;
}

/**
 * Coloca UMA peça: tenta a página atual (última); se não couber, abre nova.
 * Retorna o `Slot` posicionado, ou `null` se não cabe nem numa página vazia.
 */
function placeOne(pages: Slot[][], piece: Piece, page: PageSpec): Slot | null {
  const params = paramsFor(piece);
  const current = pages[pages.length - 1];
  const spot = current ? findSpot(current, params, page) : null;
  const target = spot ? current : [];
  const at = spot ?? findSpot([], params, page);
  if (!at) {
    return null;
  }
  const slot: Slot = { url: piece.url, sizeMm: piece.sizeMm, artMm: piece.artMm, xMm: at.x, yMm: at.y, params };
  target.push(slot);
  if (!spot) {
    pages.push(target);
  }
  return slot;
}

/** Projeta o slot interno no shape público de saída. */
function toPiece(s: Slot): PlacedPiece {
  return { url: s.url, sizeMm: s.sizeMm, artMm: s.artMm, xMm: s.xMm, yMm: s.yMm };
}

/**
 * Empacota artes em folha(s) via **bottom-left guloso agnóstico de forma**:
 * expande por quantidade, ordena por `artMm` DESC (maiores primeiro, deixando
 * vãos p/ menores) e, peça a peça, ocupa a 1ª posição válida (varredura em grade)
 * da página atual; overflow abre página nova. Determinístico. Invariantes: sem
 * colisão (respeita `gapMm`, densa p/ círculo) e tudo dentro da margem.
 * `utilizationPct` = Σ(área da forma) ÷ (área útil × nº páginas) × 100.
 */
export function packSheet(items: readonly SheetInput[], page: PageSpec = A4): PackedSheet {
  const pieces = expand(items).sort((a, b) => b.artMm - a.artMm);
  if (pieces.length === 0) {
    return { pages: [], totalPieces: 0, utilizationPct: 0 };
  }
  const pages: Slot[][] = [];
  let filledMm2 = 0;
  for (const piece of pieces) {
    const slot = placeOne(pages, piece, page);
    if (slot) {
      filledMm2 += SHAPE_GEOMETRY[slot.params.kind].area(slot.params);
    }
  }
  const usableW = page.widthMm - 2 * page.marginMm;
  const usableH = page.heightMm - 2 * page.marginMm;
  const usableArea = usableW * usableH * pages.length;
  const utilizationPct = usableArea > 0 ? Math.round((filledMm2 / usableArea) * 100) : 0;
  return {
    pages: pages.map((pagePieces) => pagePieces.map(toPiece)),
    totalPieces: pieces.length,
    utilizationPct,
  };
}
