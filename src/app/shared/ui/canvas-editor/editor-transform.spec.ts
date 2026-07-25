import { DEFAULT_TRANSFORM } from '../../types';
import {
  SCALE_MAX,
  SCALE_MIN,
  resetTransform,
  withBackground,
  withOffset,
  withRotation,
  withRotationDelta,
  withScale,
  withZoom,
} from './editor-transform';

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

  it('resetTransform zera ajuste mas preserva o fundo', () => {
    const custom = { offset: { x: 9, y: 9 }, scale: 3, rotation: 45, background: '#ff0000' };
    const reset = resetTransform(custom);
    expect(reset.offset).toEqual({ x: 0, y: 0 });
    expect(reset.scale).toBe(1);
    expect(reset.rotation).toBe(0);
    expect(reset.background).toBe('#ff0000');
  });

  it('withBackground troca apenas a cor', () => {
    expect(withBackground(DEFAULT_TRANSFORM, '#123456').background).toBe('#123456');
  });
});
