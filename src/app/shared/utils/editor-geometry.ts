import type { EditorTransform, PrintSpec } from '../types';
import { artDiameterMm, safeDiameterMm } from './resolution';

/** Fração do viewport ocupada pelo diâmetro da arte (margem p/ rótulos). */
const ART_FILL_RATIO = 0.82;

/** Raios (em px de canvas) das três guias + centro e escala mm→px. */
export interface EditorLayout {
  readonly center: number;
  readonly pxPerMm: number;
  readonly bleedR: number;
  readonly cutR: number;
  readonly safeR: number;
}

/** Calcula o layout das guias para um viewport quadrado de lado `side`. */
export function computeLayout(spec: PrintSpec, side: number): EditorLayout {
  const artMm = artDiameterMm(spec);
  const bleedDiameter = side * ART_FILL_RATIO;
  const pxPerMm = bleedDiameter / artMm;
  return {
    center: side / 2,
    pxPerMm,
    bleedR: bleedDiameter / 2,
    cutR: (spec.visibleMm * pxPerMm) / 2,
    safeR: (safeDiameterMm(spec) * pxPerMm) / 2,
  };
}

/**
 * Tamanho de desenho da imagem no canvas. A 1× (cover) o menor lado da imagem
 * cobre o diâmetro da arte; `scale` amplia a partir daí.
 */
export function imageDrawSize(
  naturalWidth: number,
  naturalHeight: number,
  bleedDiameterPx: number,
  scale: number,
): { drawW: number; drawH: number } {
  const minSide = Math.min(naturalWidth, naturalHeight) || 1;
  const base = (bleedDiameterPx / minSide) * scale;
  return { drawW: naturalWidth * base, drawH: naturalHeight * base };
}

function rotate(x: number, y: number, rad: number): { x: number; y: number } {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/**
 * `true` se a imagem transformada cobre TODO o círculo de sangria (sem áreas
 * vazias). Verifica a contenção do círculo dentro do retângulo da imagem no
 * referencial local (rotacionado).
 */
export function isBleedCovered(params: {
  transform: EditorTransform;
  drawW: number;
  drawH: number;
  bleedR: number;
}): boolean {
  const rad = (-params.transform.rotation * Math.PI) / 180;
  const local = rotate(-params.transform.offset.x, -params.transform.offset.y, rad);
  const hw = params.drawW / 2;
  const hh = params.drawH / 2;
  return (
    hw - Math.abs(local.x) >= params.bleedR &&
    hh - Math.abs(local.y) >= params.bleedR
  );
}
