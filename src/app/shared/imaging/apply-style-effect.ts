import type { StyleEffect } from '../types';
import { boxBlur } from './box-blur';
import { halftone } from './halftone';
import { pencilSketch } from './pencil-sketch';
import { posterize } from './posterize';
import { quantizeColors } from './quantize-colors';

/** Defaults por parâmetro (aplicados quando o efeito não especifica). */
const DEF = {
  levels: 5,
  colors: 6,
  cellFrac: 0.012,
} as const;

/**
 * applyStyleEffect — DISPATCHER puro do style pass (ADR-019). Converte os
 * parâmetros normalizados em px via `resolutionScale` (o lado maior da arte, em
 * px, nesta resolução) e delega à função pura do efeito. `kind === 'none'`
 * devolve o `src` intacto. Posterize/quantize são estáveis por resolução
 * (paridade EXATA); edge/halftone escalam por `resolutionScale` (paridade
 * aproximada preview↔bake). Os efeitos com foto suave recebem pré-desfoque.
 */
export function applyStyleEffect(
  src: ImageData,
  effect: StyleEffect,
  resolutionScale: number,
): ImageData {
  switch (effect.kind) {
    case 'posterize':
      return posterize(boxBlur(src, posterBlurPx(resolutionScale)), effect.levels ?? DEF.levels);
    case 'quantize':
      return quantizeColors(src, effect.colors ?? DEF.colors);
    case 'edge':
      return pencilSketch(src, sketchOptions(resolutionScale));
    case 'halftone':
      return halftone(src, halftoneOptions(effect, resolutionScale));
    default:
      return src;
  }
}

/** Raio do pré-desfoque do pôster (px), derivado da resolução. */
function posterBlurPx(scale: number): number {
  return Math.max(1, Math.round(0.0033 * scale));
}

/** Resolve as opções do traço de lápis (constantes fixas + ganho por escala). */
function sketchOptions(scale: number) {
  return {
    blurPx: Math.max(1, Math.round(0.0022 * scale)),
    gain: 12 * (scale / 460),
    gamma: 0.75,
  };
}

/** Resolve as opções do meio-tom (fração do diâmetro → px). */
function halftoneOptions(effect: StyleEffect, scale: number) {
  const frac = effect.cellFrac ?? DEF.cellFrac;
  return {
    cellPx: Math.max(3, Math.round(frac * scale)),
    kScale: 0.65,
  };
}
