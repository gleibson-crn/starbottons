/**
 * StyleEffect — estágio "style pass" por pixel (ADR-019), SEPARADO de
 * `ImageFilters` (que permanece CSS-puro e inalterado). Modela efeitos que NÃO
 * são expressáveis em `ctx.filter` (posterização, borda/Sobel, quantização de
 * k-cores, halftone) e exigem processamento por pixel num estágio offscreen
 * ANTES da composição. Os parâmetros resolution-dependent (halftone/edge) são
 * normalizados como FRAÇÃO DO DIÂMETRO e escalados por resolução dentro de
 * `applyStyleEffect`, garantindo paridade preview↔mockup↔bake.
 */
export type StyleKind = 'none' | 'posterize' | 'edge' | 'quantize' | 'halftone';

export interface StyleEffect {
  readonly kind: StyleKind;
  /** posterize: faixas de brilho (2..8). */
  readonly levels?: number;
  /** quantize: nº de cores da paleta (2..16), median-cut DETERMINÍSTICO. */
  readonly colors?: number;
  /** halftone: lado da célula como fração do diâmetro. */
  readonly cellFrac?: number;
}

/** Estado neutro: nenhum estilo (caminho ctx.filter atual permanece intocado). */
export const DEFAULT_STYLE_EFFECT: StyleEffect = { kind: 'none' };

/** `true` quando não há estilo aplicado (equivale ao caminho tonal puro). */
export function isDefaultStyle(e: StyleEffect): boolean {
  return e.kind === 'none';
}

/** Parâmetros relevantes por tipo (os demais são ignorados na comparação). */
function activeParams(e: StyleEffect): readonly (number | boolean | undefined)[] {
  switch (e.kind) {
    case 'posterize':
      return [e.levels];
    case 'quantize':
      return [e.colors];
    case 'edge':
      return [];
    case 'halftone':
      return [e.cellFrac];
    default:
      return [];
  }
}

/** `true` quando dois efeitos têm o MESMO kind e os MESMOS parâmetros ativos. */
export function styleEffectEqual(a: StyleEffect, b: StyleEffect): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  const pa = activeParams(a);
  const pb = activeParams(b);
  return pa.length === pb.length && pa.every((v, i) => v === pb[i]);
}
