import type { ImageFilters, StyleEffect } from '../types';
import { filterString, isDefaultStyle } from '../types';
import { applyStyleEffect } from './apply-style-effect';

/** Arte já pronta para composição (bitmap desenhável em `drawImage`). */
export type PreparedArt = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

/** Fábrica de canvas (injetável em testes; default = DOM). */
export type CanvasFactory = () => HTMLCanvasElement;

const defaultCanvasFactory: CanvasFactory = () => document.createElement('canvas');

/** Dimensões nativas de qualquer fonte desenhável. */
function sizeOf(src: PreparedArt): { w: number; h: number } {
  if ('naturalWidth' in src && src.naturalWidth) {
    return { w: src.naturalWidth, h: src.naturalHeight };
  }
  return { w: (src as HTMLCanvasElement).width, h: (src as HTMLCanvasElement).height };
}

/**
 * prepareArt — FONTE ÚNICA do estágio "style pass" (ADR-019). Renderiza a arte
 * num canvas cujo LADO MAIOR = `workingSide` (proxy de resolução/diâmetro),
 * aplicando primeiro o tonal (`ctx.filter`) e depois o efeito de estilo por
 * pixel (`applyStyleEffect`), na ordem tonal → estilo → composição. É consumida
 * pelos três renderizadores (editor, mockup, bake), garantindo paridade por
 * construção. Devolve o canvas estilizado; o chamador o passa como `image` ao
 * `drawBottonFace` com `filters` OMITIDO (para não reaplicar o tonal).
 */
export function prepareArt(
  source: PreparedArt,
  filters: ImageFilters,
  style: StyleEffect,
  workingSide: number,
  createCanvas: CanvasFactory = defaultCanvasFactory,
): HTMLCanvasElement {
  const { w: sw, h: sh } = sizeOf(source);
  const scale = workingSide / Math.max(sw, sh);
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = createCanvas();
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D indisponível para preparar a arte.');
  }
  const css = filterString(filters);
  if (css) {
    ctx.filter = css;
  }
  ctx.drawImage(source, 0, 0, w, h);
  ctx.filter = 'none';
  if (isDefaultStyle(style)) {
    return canvas;
  }
  const styled = applyStyleEffect(ctx.getImageData(0, 0, w, h), style, Math.max(w, h));
  ctx.putImageData(styled, 0, 0);
  return canvas;
}
