import type { Framing } from '../../types';
import {
  resetTransform,
  withOffset,
  withRotationDelta,
  withZoom,
} from './editor-transform';

const ZOOM_STEP = 1.1;
const ROT_STEP = 5;

/**
 * Mapeia uma tecla para uma mutação de enquadramento (WCAG 2.1.1 — todo gesto
 * tem equivalente de teclado). Genérico sobre `Framing`: serve para a arte e
 * para o fundo. Retorna `null` quando a tecla não é reconhecida.
 *
 * Setas movem; `+/-` dão zoom; `[ ]` rotacionam; `r` redefine.
 */
export function applyKey<T extends Framing>(
  t: T,
  key: string,
  step: number,
): T | null {
  switch (key) {
    case 'ArrowLeft':
      return withOffset(t, -step, 0);
    case 'ArrowRight':
      return withOffset(t, step, 0);
    case 'ArrowUp':
      return withOffset(t, 0, -step);
    case 'ArrowDown':
      return withOffset(t, 0, step);
    default:
      return applySymbolKey(t, key);
  }
}

function applySymbolKey<T extends Framing>(t: T, key: string): T | null {
  switch (key) {
    case '+':
    case '=':
      return withZoom(t, ZOOM_STEP);
    case '-':
    case '_':
      return withZoom(t, 1 / ZOOM_STEP);
    case '[':
      return withRotationDelta(t, -ROT_STEP);
    case ']':
      return withRotationDelta(t, ROT_STEP);
    case 'r':
    case 'R':
      return resetTransform(t);
    default:
      return null;
  }
}
