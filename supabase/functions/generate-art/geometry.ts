/**
 * Matemática de layout compartilhada (ADR-001 / ADR-003).
 *
 * ⚠️ Estas fórmulas DEVEM permanecer idênticas às do frontend em
 * `src/app/shared/utils/mm-px.ts`. Preview (Canvas) e arte final (esta Edge)
 * precisam concordar exatamente — por isso são copiadas byte a byte aqui.
 * Se um lado mudar, o outro muda junto (não há import cross-runtime).
 */

import type { ArtLayout, PrintSpec } from "./types.ts";

/** DPI padrão da arte no MVP (RGB 300 DPI — ADR-004). */
export const DEFAULT_DPI = 300;

/** Milímetros por polegada. */
const MM_PER_INCH = 25.4;

/** Pontos tipográficos por polegada. */
const PT_PER_INCH = 72;

/**
 * Converte milímetros para pixels num dado DPI, arredondando para o inteiro
 * mais próximo (pixels são discretos). Idêntico a mmToPx do frontend.
 */
export function mmToPx(mm: number, dpi: number = DEFAULT_DPI): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

/**
 * Converte milímetros para pontos tipográficos (unidade do PDF).
 * Não arredonda. Idêntico a mmToPt do frontend.
 */
export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * PT_PER_INCH;
}

/**
 * Deriva o layout em pixels/pontos a partir de uma print_spec.
 *
 * Fonte da verdade do tamanho físico = `art_diameter_mm`. Invariante garantido
 * por construção (bleed_mm = (art - visible)/2), validado em geometry.test.ts:
 *   visible_px + 2*bleed_px == art_px  (±1px)
 */
export function computeLayout(spec: PrintSpec): ArtLayout {
  const dpi = spec.dpi_target ?? DEFAULT_DPI;
  const artPx = mmToPx(spec.art_diameter_mm, dpi);
  const visiblePx = mmToPx(spec.visible_mm, dpi);
  const bleedPx = mmToPx(spec.bleed_mm, dpi);
  const safePx = mmToPx(spec.safe_mm, dpi);
  return {
    dpi,
    artPx,
    visiblePx,
    bleedPx,
    safePx,
    artCenter: artPx / 2,
    visibleRadiusPx: visiblePx / 2,
    safeRadiusPx: (visiblePx - 2 * safePx) / 2,
    artWidthPt: mmToPt(spec.art_diameter_mm),
    artHeightPt: mmToPt(spec.art_diameter_mm),
  };
}
