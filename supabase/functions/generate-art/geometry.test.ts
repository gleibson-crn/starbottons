/**
 * Testa o invariante geométrico compartilhado entre preview e arte final:
 *   visible_px + 2*bleed_px == art_px  (±1px por causa do arredondamento).
 *
 * Sem dependências externas de propósito — roda offline com `deno test`.
 * Execução: deno test supabase/functions/generate-art/geometry.test.ts
 */

import { assert, assertEquals } from "@std/assert";
import { computeLayout, mmToPt, mmToPx } from "./geometry.ts";
import type { PrintSpec } from "./types.ts";

// Seed real das migrations (fonte da verdade = art_diameter_mm).
const SEED: PrintSpec[] = [
  {
    shape: "round",
    visible_mm: 32,
    art_diameter_mm: 44,
    bleed_mm: 6,
    safe_mm: 2,
    dpi_target: 300,
  },
  {
    shape: "round",
    visible_mm: 44,
    art_diameter_mm: 54,
    bleed_mm: 5,
    safe_mm: 2,
    dpi_target: 300,
  },
  {
    shape: "round",
    visible_mm: 58,
    art_diameter_mm: 70,
    bleed_mm: 6,
    safe_mm: 2,
    dpi_target: 300,
  },
];

// art@300 esperado (do enunciado): 520 / 638 / 827px.
const EXPECTED_ART_PX = [520, 638, 827];

Deno.test("invariante visible_px + 2*bleed_px == art_px (±1) para os 3 tamanhos", () => {
  for (const spec of SEED) {
    const l = computeLayout(spec);
    const reconstructed = l.visiblePx + 2 * l.bleedPx;
    const delta = Math.abs(reconstructed - l.artPx);
    assert(
      delta <= 1,
      `${spec.visible_mm}mm: visible(${l.visiblePx}) + 2*bleed(${l.bleedPx}) = ${reconstructed} vs art ${l.artPx} (Δ=${delta})`,
    );
  }
});

Deno.test("art_px bate com a matriz de impressão (520/638/827 e todos < 900 → síncrono)", () => {
  SEED.forEach((spec, i) => {
    const l = computeLayout(spec);
    assertEquals(l.artPx, EXPECTED_ART_PX[i], `art_px de ${spec.visible_mm}mm`);
    assert(
      l.artPx < 900,
      `art_px ${l.artPx} deve caber no caminho síncrono (<900px)`,
    );
  });
});

Deno.test("bleed_mm é derivado, nunca constante", () => {
  for (const spec of SEED) {
    assertEquals(spec.bleed_mm, (spec.art_diameter_mm - spec.visible_mm) / 2);
  }
});

Deno.test("mmToPx / mmToPt idênticos às fórmulas do frontend", () => {
  assertEquals(mmToPx(25.4, 300), 300); // 1 polegada @300dpi = 300px
  assertEquals(mmToPt(25.4), 72); // 1 polegada = 72pt
  assertEquals(mmToPx(44, 300), 520);
});
