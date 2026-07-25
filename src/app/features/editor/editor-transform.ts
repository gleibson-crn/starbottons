import type { EditorTransform } from '../../shared/types';
import { DEFAULT_TRANSFORM } from '../../shared/types';

export const SCALE_MIN = 0.2;
export const SCALE_MAX = 8;
export const ROT_MIN = -180;
export const ROT_MAX = 180;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Move o enquadramento por um delta em px de tela. */
export function withOffset(
  t: EditorTransform,
  dx: number,
  dy: number,
): EditorTransform {
  return { ...t, offset: { x: t.offset.x + dx, y: t.offset.y + dy } };
}

/** Multiplica o zoom por um fator (clampeado). */
export function withZoom(t: EditorTransform, factor: number): EditorTransform {
  return { ...t, scale: clamp(t.scale * factor, SCALE_MIN, SCALE_MAX) };
}

/** Define o zoom por valor absoluto (slider). */
export function withScale(t: EditorTransform, value: number): EditorTransform {
  return { ...t, scale: clamp(value, SCALE_MIN, SCALE_MAX) };
}

/** Define a rotação absoluta em graus (clampeada a −180..180). */
export function withRotation(t: EditorTransform, deg: number): EditorTransform {
  return { ...t, rotation: clamp(deg, ROT_MIN, ROT_MAX) };
}

/** Aplica um delta de rotação em graus. */
export function withRotationDelta(
  t: EditorTransform,
  delta: number,
): EditorTransform {
  return withRotation(t, t.rotation + delta);
}

/** Troca a cor de fundo da área vazia. */
export function withBackground(
  t: EditorTransform,
  color: string,
): EditorTransform {
  return { ...t, background: color };
}

/** Redefine o ajuste (posição/zoom/rotação), preservando o fundo escolhido. */
export function resetTransform(t: EditorTransform): EditorTransform {
  return { ...DEFAULT_TRANSFORM, background: t.background };
}
