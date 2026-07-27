import type { PrintSpec } from '../types';
import {
  artDiameterMm,
  effectiveDpi,
  resolutionTier,
  safeDiameterMm,
} from './resolution';

const SPEC_32: PrintSpec = {
  model: 'round',
  sizeMm: 32,
  visibleMm: 32,
  artDiameterMm: 44,
  bleedMm: 6,
  safeMm: 2,
  dpiTarget: 300,
};

describe('geometria da arte', () => {
  it('diâmetro da arte = face + 2× sangria', () => {
    expect(artDiameterMm(SPEC_32)).toBe(44);
  });

  it('zona de segurança = face − 2× margem', () => {
    expect(safeDiameterMm(SPEC_32)).toBe(28);
  });
});

describe('effectiveDpi', () => {
  it('imagem 520px de menor lado @1× ≈ 300 DPI (44mm)', () => {
    const dpi = effectiveDpi({
      naturalWidth: 520,
      naturalHeight: 800,
      scale: 1,
      spec: SPEC_32,
    });
    expect(Math.round(dpi)).toBe(300);
  });

  it('dobrar o zoom reduz o DPI pela metade', () => {
    const base = effectiveDpi({ naturalWidth: 520, naturalHeight: 800, scale: 1, spec: SPEC_32 });
    const zoomed = effectiveDpi({ naturalWidth: 520, naturalHeight: 800, scale: 2, spec: SPEC_32 });
    expect(zoomed).toBeCloseTo(base / 2, 5);
  });

  it('usa o menor lado da imagem (cover)', () => {
    const dpi = effectiveDpi({ naturalWidth: 2000, naturalHeight: 520, scale: 1, spec: SPEC_32 });
    expect(Math.round(dpi)).toBe(300);
  });

  it('retorna 0 para imagem sem dimensão', () => {
    expect(effectiveDpi({ naturalWidth: 0, naturalHeight: 0, scale: 1, spec: SPEC_32 })).toBe(0);
  });
});

describe('resolutionTier (3 faixas)', () => {
  it('🟢 ok em ≥300', () => {
    expect(resolutionTier(300)).toBe('ok');
    expect(resolutionTier(650)).toBe('ok');
  });

  it('🟡 warn em 150–299', () => {
    expect(resolutionTier(299)).toBe('warn');
    expect(resolutionTier(150)).toBe('warn');
  });

  it('🔴 muito baixa em <150 (aviso forte, não trava)', () => {
    expect(resolutionTier(149)).toBe('blocked');
    expect(resolutionTier(0)).toBe('blocked');
  });
});
