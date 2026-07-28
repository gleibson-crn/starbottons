import { DEFAULT_TRANSFORM } from '../../types';
import type { BackgroundImageRef } from '../../types';
import {
  SCALE_MAX,
  SCALE_MIN,
  clearBackgroundImage,
  resetTransform,
  withBackground,
  withBackgroundImage,
  withOffset,
  withRotation,
  withRotationDelta,
  withScale,
  withZoom,
} from './editor-transform';

const BG_REF: BackgroundImageRef = {
  path: 'user/bg-1.png',
  url: 'blob:bg-1',
  source: 'upload',
  offset: { x: 0, y: 0 },
  scale: 1,
  rotation: 0,
};

describe('editor-transform', () => {
  it('withOffset acumula deslocamento', () => {
    const t = withOffset(withOffset(DEFAULT_TRANSFORM, 5, -3), 2, 3);
    expect(t.offset).toEqual({ x: 7, y: 0 });
  });

  it('withZoom clampeia no máximo e mínimo', () => {
    expect(withZoom(DEFAULT_TRANSFORM, 1000).scale).toBe(SCALE_MAX);
    expect(withZoom(DEFAULT_TRANSFORM, 0.0001).scale).toBe(SCALE_MIN);
  });

  it('withScale respeita os limites', () => {
    expect(withScale(DEFAULT_TRANSFORM, 3).scale).toBe(3);
    expect(withScale(DEFAULT_TRANSFORM, 99).scale).toBe(SCALE_MAX);
  });

  it('withRotation clampeia a −180..180', () => {
    expect(withRotation(DEFAULT_TRANSFORM, 400).rotation).toBe(180);
    expect(withRotation(DEFAULT_TRANSFORM, -400).rotation).toBe(-180);
  });

  it('withRotationDelta soma e clampeia', () => {
    expect(withRotationDelta({ ...DEFAULT_TRANSFORM, rotation: 178 }, 5).rotation).toBe(180);
  });

  it('resetTransform zera ajuste mas preserva a COR de fundo', () => {
    const custom = {
      offset: { x: 9, y: 9 },
      scale: 3,
      rotation: 45,
      background: '#ff0000',
      backgroundImage: null,
    };
    const reset = resetTransform(custom);
    expect(reset.offset).toEqual({ x: 0, y: 0 });
    expect(reset.scale).toBe(1);
    expect(reset.rotation).toBe(0);
    expect(reset.background).toBe('#ff0000');
  });

  it('resetTransform preserva a IMAGEM de fundo (é fundo, não enquadramento)', () => {
    const custom = withBackgroundImage(
      { ...DEFAULT_TRANSFORM, scale: 4, offset: { x: 5, y: 5 } },
      BG_REF,
    );
    const reset = resetTransform(custom);
    expect(reset.scale).toBe(1);
    expect(reset.offset).toEqual({ x: 0, y: 0 });
    expect(reset.backgroundImage).toEqual(BG_REF);
  });

  it('withBackground troca apenas a cor', () => {
    expect(withBackground(DEFAULT_TRANSFORM, '#123456').background).toBe('#123456');
  });

  it('withBackgroundImage define a imagem de fundo', () => {
    const t = withBackgroundImage(DEFAULT_TRANSFORM, BG_REF);
    expect(t.backgroundImage).toEqual(BG_REF);
  });

  it('withBackgroundImage inicializa o enquadramento neutro se não vier', () => {
    const t = withBackgroundImage(DEFAULT_TRANSFORM, {
      path: 'user/x.png',
      url: 'blob:x',
      source: 'upload',
    });
    expect(t.backgroundImage?.offset).toEqual({ x: 0, y: 0 });
    expect(t.backgroundImage?.scale).toBe(1);
    expect(t.backgroundImage?.rotation).toBe(0);
  });

  it('withBackgroundImage preserva o enquadramento quando informado', () => {
    const t = withBackgroundImage(DEFAULT_TRANSFORM, {
      path: 'user/x.png',
      url: 'blob:x',
      source: 'upload',
      offset: { x: 12, y: -5 },
      scale: 1.5,
      rotation: 20,
    });
    expect(t.backgroundImage?.offset).toEqual({ x: 12, y: -5 });
    expect(t.backgroundImage?.scale).toBe(1.5);
    expect(t.backgroundImage?.rotation).toBe(20);
  });

  it('resetTransform genérico zera um Framing de fundo', () => {
    const framing = { offset: { x: 9, y: -3 }, scale: 2.5, rotation: 40 };
    const reset = resetTransform(framing);
    expect(reset).toEqual({ offset: { x: 0, y: 0 }, scale: 1, rotation: 0 });
  });

  it('clearBackgroundImage volta para null (usa só a cor)', () => {
    const t = withBackgroundImage(DEFAULT_TRANSFORM, BG_REF);
    expect(clearBackgroundImage(t).backgroundImage).toBeNull();
  });
});
