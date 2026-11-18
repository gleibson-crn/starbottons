import {
  DEFAULT_STYLE_EFFECT,
  isDefaultStyle,
  styleEffectEqual,
  type StyleEffect,
} from './style-effect';

describe('isDefaultStyle', () => {
  it('true só para kind none', () => {
    expect(isDefaultStyle(DEFAULT_STYLE_EFFECT)).toBe(true);
    expect(isDefaultStyle({ kind: 'posterize', levels: 4 })).toBe(false);
  });
});

describe('styleEffectEqual', () => {
  it('kinds diferentes nunca são iguais', () => {
    expect(styleEffectEqual({ kind: 'posterize' }, { kind: 'quantize' })).toBe(false);
  });

  it('mesmo kind + mesmos parâmetros ativos = iguais', () => {
    const a: StyleEffect = { kind: 'posterize', levels: 4 };
    const b: StyleEffect = { kind: 'posterize', levels: 4 };
    expect(styleEffectEqual(a, b)).toBe(true);
  });

  it('mesmo kind + parâmetros ativos diferentes = diferentes', () => {
    expect(
      styleEffectEqual({ kind: 'quantize', colors: 6 }, { kind: 'quantize', colors: 8 }),
    ).toBe(false);
  });

  it('ignora parâmetros IRRELEVANTES ao kind', () => {
    // `colors` não é ativo em posterize → não afeta a igualdade.
    const a: StyleEffect = { kind: 'posterize', levels: 3, colors: 2 };
    const b: StyleEffect = { kind: 'posterize', levels: 3, colors: 16 };
    expect(styleEffectEqual(a, b)).toBe(true);
  });

  it('edge não tem parâmetros ajustáveis: dois edge são sempre iguais', () => {
    expect(styleEffectEqual({ kind: 'edge' }, { kind: 'edge' })).toBe(true);
  });

  it('halftone compara apenas cellFrac', () => {
    const base: StyleEffect = { kind: 'halftone', cellFrac: 0.012 };
    expect(styleEffectEqual(base, { ...base })).toBe(true);
    expect(styleEffectEqual(base, { kind: 'halftone', cellFrac: 0.02 })).toBe(false);
  });

  it('dois none são iguais', () => {
    expect(styleEffectEqual({ kind: 'none' }, DEFAULT_STYLE_EFFECT)).toBe(true);
  });
});
