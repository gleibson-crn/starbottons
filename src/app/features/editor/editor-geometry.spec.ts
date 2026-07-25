import { DEFAULT_TRANSFORM, type PrintSpec } from '../../shared/types';
import { computeLayout, imageDrawSize, isBleedCovered } from './editor-geometry';

const SPEC: PrintSpec = {
  model: 'round',
  sizeMm: 44,
  visibleMm: 44,
  artDiameterMm: 56,
  bleedMm: 6,
  safeMm: 2,
  dpiTarget: 300,
};

describe('computeLayout', () => {
  it('mantém a ordem dos raios: segurança < corte < sangria', () => {
    const l = computeLayout(SPEC, 520);
    expect(l.safeR).toBeLessThan(l.cutR);
    expect(l.cutR).toBeLessThan(l.bleedR);
    expect(l.center).toBe(260);
  });
});

describe('imageDrawSize', () => {
  it('a 1× o menor lado cobre o diâmetro da sangria', () => {
    const { drawW } = imageDrawSize(400, 800, 440, 1);
    expect(drawW).toBeCloseTo(440, 6);
  });

  it('o zoom amplia proporcionalmente', () => {
    const base = imageDrawSize(400, 800, 440, 1);
    const zoom = imageDrawSize(400, 800, 440, 2);
    expect(zoom.drawW).toBeCloseTo(base.drawW * 2, 5);
  });
});

describe('isBleedCovered', () => {
  const bleedR = 220;

  it('cobre quando a imagem é maior que a sangria e está centrada', () => {
    const covered = isBleedCovered({
      transform: DEFAULT_TRANSFORM,
      drawW: 600,
      drawH: 600,
      bleedR,
    });
    expect(covered).toBe(true);
  });

  it('não cobre quando o deslocamento afasta demais a imagem', () => {
    const covered = isBleedCovered({
      transform: { ...DEFAULT_TRANSFORM, offset: { x: 300, y: 0 } },
      drawW: 600,
      drawH: 600,
      bleedR,
    });
    expect(covered).toBe(false);
  });
});
