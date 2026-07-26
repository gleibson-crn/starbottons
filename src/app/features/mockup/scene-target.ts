import type { EditorTransform, SceneTargetPx } from '../../shared/ui';
import { DEFAULT_TRANSFORM } from '../../shared/types';
import { clamp, ROT_MAX, ROT_MIN, SCALE_MAX, SCALE_MIN } from '../../shared/ui';

/**
 * Alvo circular NORMALIZADO (0..1), independente da resolução da cena — é o
 * contrato persistido em `mockup_templates.target`.
 * `cx`/`cy` são frações da largura/altura; `r` é fração de `min(w,h)`.
 */
export interface SceneTarget {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly rotation: number;
}

/** Dimensões (px) de um plano — tela do preview OU resolução natural da cena. */
export interface SceneDims {
  readonly width: number;
  readonly height: number;
}

/** Raio-base do alvo (scale = 1) como fração do menor lado da cena. */
export const BASE_TARGET_RATIO = 0.2;

/** Alvo default: centralizado, raio-base, sem rotação. */
export const DEFAULT_SCENE_TARGET: SceneTarget = {
  cx: 0.5,
  cy: 0.5,
  r: BASE_TARGET_RATIO,
  rotation: 0,
};

function baseRadius(dims: SceneDims): number {
  return Math.min(dims.width, dims.height) * BASE_TARGET_RATIO;
}

/** Alvo em px de um plano → alvo normalizado 0..1. */
export function normalizeTarget(px: SceneTargetPx, dims: SceneDims): SceneTarget {
  const minSide = Math.min(dims.width, dims.height) || 1;
  return {
    cx: px.cx / (dims.width || 1),
    cy: px.cy / (dims.height || 1),
    r: px.r / minSide,
    rotation: px.rotation,
  };
}

/** Alvo normalizado → px de um plano (tela do preview ou resolução natural). */
export function denormalizeTarget(n: SceneTarget, dims: SceneDims): SceneTargetPx {
  const minSide = Math.min(dims.width, dims.height);
  return {
    cx: n.cx * dims.width,
    cy: n.cy * dims.height,
    r: n.r * minSide,
    rotation: n.rotation,
  };
}

/**
 * EditorTransform (gestos: offset = pan do alvo, scale = tamanho, rotation) →
 * alvo em px do plano. Reusa a semântica do editor para herdar teclado/sliders.
 */
export function transformToTargetPx(
  t: EditorTransform,
  dims: SceneDims,
): SceneTargetPx {
  return {
    cx: dims.width / 2 + t.offset.x,
    cy: dims.height / 2 + t.offset.y,
    r: baseRadius(dims) * t.scale,
    rotation: t.rotation,
  };
}

/** Alvo em px → EditorTransform (clampeado aos limites do editor). */
export function targetPxToTransform(
  px: SceneTargetPx,
  dims: SceneDims,
): EditorTransform {
  const base = baseRadius(dims) || 1;
  return {
    ...DEFAULT_TRANSFORM,
    offset: { x: px.cx - dims.width / 2, y: px.cy - dims.height / 2 },
    scale: clamp(px.r / base, SCALE_MIN, SCALE_MAX),
    rotation: clamp(px.rotation, ROT_MIN, ROT_MAX),
  };
}

/** EditorTransform → alvo normalizado (atalho preview → contrato). */
export function transformToSceneTarget(
  t: EditorTransform,
  dims: SceneDims,
): SceneTarget {
  return normalizeTarget(transformToTargetPx(t, dims), dims);
}

/** Alvo normalizado → EditorTransform (atalho contrato → preview). */
export function sceneTargetToTransform(
  n: SceneTarget,
  dims: SceneDims,
): EditorTransform {
  return targetPxToTransform(denormalizeTarget(n, dims), dims);
}
