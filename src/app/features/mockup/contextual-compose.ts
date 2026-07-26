import type { EditorTransform, PrintSpec } from '../../shared/types';
import {
  renderContextualMockup,
  renderMockupSprite,
  type MockupSprite,
} from '../../shared/ui';
import { denormalizeTarget, type SceneTarget } from './scene-target';

/** Entradas para compor o mockup contextual na resolução natural da cena. */
export interface ComposeInput {
  readonly scene: HTMLImageElement;
  readonly bottonImage: HTMLImageElement;
  readonly bottonTransform: EditorTransform;
  readonly spec: PrintSpec;
  readonly target: SceneTarget;
  readonly lighting?: 'none' | 'multiply-soft';
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
  input: Pick<ComposeInput, 'bottonImage' | 'bottonTransform' | 'spec'>,
  targetRadiusPx: number,
): MockupSprite {
  return renderMockupSprite({
    image: input.bottonImage,
    transform: input.bottonTransform,
    spec: input.spec,
    targetRadiusPx,
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
