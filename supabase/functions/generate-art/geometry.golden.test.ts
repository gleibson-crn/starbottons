/**
 * GOLDEN / caracterização dimensional (backend).
 *
 * Espelha src/app/shared/utils/mm-px.golden.spec.ts do frontend. Ancora os
 * VALORES ABSOLUTOS @300 DPI da matriz de impressão para os 3 tamanhos, agora
 * pela via real de produção da Edge: computeLayout(spec). O teste existente em
 * geometry.test.ts já travava art@300; aqui completamos com face@300 e
 * bleed@300/lado, que faltavam ancorados.
 *
 *   face_mm | art_mm | face@300 | art@300 | bleed@300/lado
 *      32   |   44   |   378    |   520   |     71
 *      44   |   54   |   520    |   638   |     59
 *      58   |   70   |   685    |   827   |     71
 *
 * Execução: deno test supabase/functions/generate-art/geometry.golden.test.ts
 */
import { assert, assertEquals } from "@std/assert";
import { computeLayout } from "./geometry.ts";
import type { PrintSpec } from "./types.ts";

interface GoldenCase {
  readonly spec: PrintSpec;
  readonly facePx: number;
  readonly artPx: number;
  readonly bleedPx: number;
}

const spec = (
  visible_mm: number,
  art_diameter_mm: number,
  bleed_mm: number,
): PrintSpec => ({
  shape: "round",
  visible_mm,
  art_diameter_mm,
  bleed_mm,
  safe_mm: 2,
  dpi_target: 300,
});

const GOLDEN: GoldenCase[] = [
  { spec: spec(32, 44, 6), facePx: 378, artPx: 520, bleedPx: 71 },
  { spec: spec(44, 54, 5), facePx: 520, artPx: 638, bleedPx: 59 },
  { spec: spec(58, 70, 6), facePx: 685, artPx: 827, bleedPx: 71 },
];

Deno.test("GOLDEN face@300 (visiblePx) = 378/520/685", () => {
  const got = GOLDEN.map(({ spec }) => computeLayout(spec).visiblePx);
  assertEquals(got, [378, 520, 685]);
});

Deno.test("GOLDEN art@300 (artPx) = 520/638/827", () => {
  const got = GOLDEN.map(({ spec }) => computeLayout(spec).artPx);
  assertEquals(got, [520, 638, 827]);
});

Deno.test("GOLDEN bleed@300/lado (bleedPx) = 71/59/71", () => {
  const got = GOLDEN.map(({ spec }) => computeLayout(spec).bleedPx);
  assertEquals(got, [71, 59, 71]);
});

Deno.test("GOLDEN por caso: face/art/bleed batem simultaneamente", () => {
  const got = GOLDEN.map(({ spec }) => {
    const l = computeLayout(spec);
    return { facePx: l.visiblePx, artPx: l.artPx, bleedPx: l.bleedPx };
  });
  const expected = GOLDEN.map(({ facePx, artPx, bleedPx }) => ({
    facePx,
    artPx,
    bleedPx,
  }));
  assertEquals(got, expected);
});

Deno.test("GOLDEN todos art@300 < 900 (caminho síncrono)", () => {
  const allSync = GOLDEN.every(({ artPx }) => artPx < 900);
  assert(allSync, "todos os art@300 devem ser < 900px");
});
