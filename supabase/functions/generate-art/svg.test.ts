/**
 * Testa a composição das camadas do SVG de layout, com foco na camada OPCIONAL
 * de imagem de fundo (feature "fundo do botton", estágio 2).
 *
 * Sem dependências externas: buildLayoutSvg é função pura (string -> string) e
 * computeLayout roda offline. Nenhum mock necessário (SUT não tem externos).
 * Execução: deno test supabase/functions/generate-art/svg.test.ts
 */

import { assert, assertEquals } from "@std/assert";
import { buildLayoutSvg } from "./svg.ts";
import { computeLayout } from "./geometry.ts";
import type { PrintSpec } from "./types.ts";

// Spec real de seed (round 32mm) só para obter um ArtLayout consistente.
const SPEC: PrintSpec = {
  shape: "round",
  visible_mm: 32,
  art_diameter_mm: 44,
  bleed_mm: 6,
  safe_mm: 2,
  dpi_target: 300,
};

const LAYOUT = computeLayout(SPEC);
const ART_B64 = "QUJD"; // "ABC" — placeholder da arte do usuário
const BG_B64 = "WFla"; // "XYZ" — placeholder do fundo

Deno.test("sem backgroundImage: nenhuma camada <image> de fundo é emitida", () => {
  const svg = buildLayoutSvg(LAYOUT, ART_B64, "#123456");
  // Só a <image> da arte do usuário deve existir.
  const imageTags = svg.match(/<image /g) ?? [];
  assertEquals(imageTags.length, 1);
  assert(svg.includes(`data:image/png;base64,${ART_B64}`));
  // A cor de fundo (camada 2) permanece exatamente como antes.
  assert(svg.includes(`fill="#123456" clip-path="url(#artClip)"`));
});

Deno.test("com backgroundImage PNG: camada de fundo entra ENTRE a cor e a arte", () => {
  const svg = buildLayoutSvg(LAYOUT, ART_B64, "#123456", {
    b64: BG_B64,
    mime: "image/png",
  });

  const colorRect = svg.indexOf(`fill="#123456"`);
  const bgImage = svg.indexOf(`data:image/png;base64,${BG_B64}`);
  const artImage = svg.indexOf(`data:image/png;base64,${ART_B64}`);

  // Ordem de empilhamento (de baixo p/ cima): cor -> imagem de fundo -> arte.
  assert(colorRect >= 0 && bgImage >= 0 && artImage >= 0);
  assert(colorRect < bgImage, "cor deve vir antes do fundo");
  assert(bgImage < artImage, "fundo deve vir antes da arte");

  // Fundo é COVER recortado ao mesmo círculo da arte.
  const bgTag = svg.slice(bgImage - 60, bgImage + 60);
  assert(bgTag.includes(`clip-path="url(#artClip)"`));
});

Deno.test("com backgroundImage JPEG: usa o mime correto no data URI", () => {
  const svg = buildLayoutSvg(LAYOUT, ART_B64, "#000000", {
    b64: BG_B64,
    mime: "image/jpeg",
  });
  assert(svg.includes(`href="data:image/jpeg;base64,${BG_B64}"`));
  // A arte do usuário continua PNG.
  assert(svg.includes(`data:image/png;base64,${ART_B64}`));
});

Deno.test("backgroundImage null: comportamento idêntico a ausente", () => {
  const withNull = buildLayoutSvg(LAYOUT, ART_B64, "#abcdef", null);
  const without = buildLayoutSvg(LAYOUT, ART_B64, "#abcdef");
  assertEquals(withNull, without);
});
