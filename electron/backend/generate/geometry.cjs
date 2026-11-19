/**
 * Matemática de layout (porte fiel de generate-art/geometry.ts).
 *
 * ⚠️ Estas fórmulas DEVEM permanecer idênticas às do frontend em
 * `src/app/shared/utils/mm-px.ts` e à edge (paridade preview × arte final).
 */

/** DPI padrão da arte (RGB 300 DPI — ADR-004). */
const DEFAULT_DPI = 300;
const MM_PER_INCH = 25.4;
const PT_PER_INCH = 72;

/** Milímetros → pixels no DPI dado, arredondando (pixels são discretos). */
function mmToPx(mm, dpi = DEFAULT_DPI) {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

/** Milímetros → pontos tipográficos (unidade do PDF). Não arredonda. */
function mmToPt(mm) {
  return (mm / MM_PER_INCH) * PT_PER_INCH;
}

/**
 * Deriva o layout em px/pt a partir de uma print_spec.
 * Invariante: visible_px + 2*bleed_px == art_px (±1px).
 */
function computeLayout(spec) {
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

module.exports = { DEFAULT_DPI, mmToPx, mmToPt, computeLayout };
