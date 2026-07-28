/**
 * Testa a composição das camadas do SVG de layout. A imagem de fundo NÃO entra
 * mais no SVG (ela é composta dentro da arte em `composeArtwork`/ImageScript,
 * para não estourar o limite de CPU do worker da Edge): o SVG tem no máximo UMA
 * `<image>` (a arte), o `<rect>` de cor recortado ao círculo e a linha de corte.
 *
 * Sem dependências externas: buildLayoutSvg é função pura (string -> string) e
 * computeLayout roda offline. Execução: deno test svg.test.ts
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

Deno.test("emite exatamente UMA <image> (a arte do usuário)", () => {
  const svg = buildLayoutSvg(LAYOUT, ART_B64, "#123456");
  const imageTags = svg.match(/<image /g) ?? [];
  assertEquals(imageTags.length, 1);
  assert(svg.includes(`data:image/png;base64,${ART_B64}`));
});

Deno.test("papel branco no quadrado + cor de fundo recortada ao círculo", () => {
  const svg = buildLayoutSvg(LAYOUT, ART_B64, "#123456");
  // Camada 1: papel branco cobrindo o quadrado inteiro (sem clip).
  assert(svg.includes(`<rect width="${LAYOUT.artPx}" height="${LAYOUT.artPx}" fill="#ffffff"/>`));
  // Camada 2: cor recortada ao círculo da arte.
  assert(svg.includes(`fill="#123456" clip-path="url(#artClip)"`));
  // Ordem: papel branco antes da cor.
  assert(svg.indexOf('fill="#ffffff"') < svg.indexOf('fill="#123456"'));
});

Deno.test("inclui a linha de corte (circunferência) sempre", () => {
  const svg = buildLayoutSvg(LAYOUT, ART_B64, "#000000");
  // Um <circle> tracejado no diâmetro da arte, depois da <image>.
  assert(/<circle[^>]*stroke-dasharray=/.test(svg), "linha de corte ausente");
  assert(svg.indexOf("<image ") < svg.lastIndexOf("<circle "));
});

Deno.test("cor de fundo é escapada para XML (aspas e < não quebram o atributo)", () => {
  const svg = buildLayoutSvg(LAYOUT, ART_B64, '"><script>');
  assert(svg.includes("&quot;"), "aspas não escapadas");
  assert(svg.includes("&lt;script"), "< não escapado");
  assert(!svg.includes('"><script'), "atributo quebrado (injeção)");
});
