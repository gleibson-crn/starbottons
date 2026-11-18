import type {
  EditorTransform,
  Framing,
  ImageFilters,
  PrintSpec,
  StyleEffect,
} from '../../shared/types';
import {
  renderContextualMockup,
  renderMockupSprite,
  type FrameLayer,
  type MockupSprite,
} from '../../shared/ui';
import { denormalizeTarget, type SceneTarget } from './scene-target';

/** Entradas para compor o mockup contextual na resolução natural da cena. */
export interface ComposeInput {
  readonly scene: HTMLImageElement;
  readonly bottonImage: HTMLImageElement;
  readonly bottonTransform: EditorTransform;
  /** Lado (px) em que os offsets foram capturados no editor (escala do offset). */
  readonly editorSide: number;
  readonly spec: PrintSpec;
  readonly target: SceneTarget;
  readonly lighting?: 'none' | 'multiply-soft';
  /** Filtros aplicados APENAS à arte (fiel ao editor). */
  readonly filters?: ImageFilters;
  /** Efeito de estilo por pixel (ADR-019; fiel ao editor). */
  readonly style?: StyleEffect;
  /** Imagem de fundo já carregada (por baixo da arte). */
  readonly backgroundImage?: HTMLImageElement | null;
  /** Enquadramento do fundo (offset/scale/rotation). */
  readonly backgroundTransform?: Framing | null;
  /** Molduras já carregadas (por cima da arte, empilhadas com seu enquadramento). */
  readonly frames?: readonly FrameLayer[];
}

function naturalDims(scene: HTMLImageElement): { width: number; height: number } {
  return {
    width: scene.naturalWidth || scene.width,
    height: scene.naturalHeight || scene.height,
  };
}

/**
 * Sprite do botton dimensionado a partir do raio-alvo desejado (px). Isolado
 * para reuso entre preview (raio de preview) e export (raio natural da cena).
 */
export function spriteForRadius(
  input: Pick<
    ComposeInput,
    'bottonImage' | 'bottonTransform' | 'editorSide' | 'spec' | 'filters' | 'style' | 'backgroundImage' | 'backgroundTransform' | 'frames'
  >,
  targetRadiusPx: number,
): MockupSprite {
  return renderMockupSprite({
    image: input.bottonImage,
    transform: input.bottonTransform,
    spec: input.spec,
    editorSide: input.editorSide,
    targetRadiusPx,
    filters: input.filters,
    style: input.style,
    backgroundImage: input.backgroundImage,
    backgroundTransform: input.backgroundTransform,
    frames: input.frames,
  });
}

/**
 * Compõe o botton sobre a cena na RESOLUÇÃO NATURAL: converte o alvo
 * normalizado para px naturais, dimensiona o sprite p/ esse raio (nitidez) e
 * cola via renderContextualMockup.
 */
export function composeContextual(input: ComposeInput): HTMLCanvasElement {
  const dims = naturalDims(input.scene);
  const targetPx = denormalizeTarget(input.target, dims);
  const sprite = spriteForRadius(input, targetPx.r);
  return renderContextualMockup({
    scene: input.scene,
    sprite,
    target: targetPx,
    lighting: input.lighting ?? 'none',
  });
}
