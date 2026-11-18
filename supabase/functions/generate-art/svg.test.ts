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
import { buildLayoutSvg, BLEED_LIGHTEN, numberBox, numberLabel } from "./svg.ts";
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

Deno.test("sangria clareada: anel branco a 50% entre o visível e a borda da arte", () => {
  const svg = buildLayoutSvg(LAYOUT, ART_B64, "#123456");
  // path branco com a fração de clareamento e furo (evenodd) no miolo visível.
  assert(
    new RegExp(`<path [^>]*fill="#ffffff" fill-opacity="${BLEED_LIGHTEN}" fill-rule="evenodd"`).test(svg),
    "anel de clareamento da sangria ausente",
  );
  // Raio EXTERNO = borda da arte; raio INTERNO = fim do círculo visível (corte).
  assert(svg.includes(`a ${LAYOUT.artCenter} ${LAYOUT.artCenter} 0 1 0`), "raio externo != artCenter");
  assert(svg.includes(`a ${LAYOUT.visibleRadiusPx} ${LAYOUT.visibleRadiusPx} 0 1 0`), "raio interno != visibleRadiusPx");
});

Deno.test("o anel de sangria vem depois da arte e antes da linha de corte", () => {
  const svg = buildLayoutSvg(LAYOUT, ART_B64, "#123456");
  const ring = svg.indexOf("fill-rule=\"evenodd\"");
  assert(svg.indexOf("<image ") < ring, "anel antes da arte");
  assert(ring < svg.lastIndexOf("<circle "), "anel depois da linha de corte");
});

Deno.test("cor de fundo é escapada para XML (aspas e < não quebram o atributo)", () => {
  const svg = buildLayoutSvg(LAYOUT, ART_B64, '"><script>');
  assert(svg.includes("&quot;"), "aspas não escapadas");
  assert(svg.includes("&lt;script"), "< não escapado");
  assert(!svg.includes('"><script'), "atributo quebrado (injeção)");
});

Deno.test("número: sem label NÃO emite a camada", () => {
  assert(!buildLayoutSvg(LAYOUT, ART_B64, "#fff").includes('id="sequence-number"'));
  assert(!buildLayoutSvg(LAYOUT, ART_B64, "#fff", false, "").includes('id="sequence-number"'));
  assertEquals(numberLabel(LAYOUT, ""), "");
});

Deno.test("número: com label '12' a camada vem DEPOIS do clareamento e ANTES do corte", () => {
  const svg = buildLayoutSvg(LAYOUT, ART_B64, "#fff", false, "12");
  const lighten = svg.indexOf('fill-rule="evenodd"');
  const num = svg.indexOf('id="sequence-number"');
  const cut = svg.indexOf("stroke-dasharray", num);
  assert(lighten >= 0 && num > lighten, "número após o clareamento");
  assert(cut > num, "número antes da linha de corte");
  assert(svg.includes('fill="#111827"'));
});

Deno.test("número: todos os retângulos ficam na sangria (fora do visível, dentro da arte)", () => {
  const label = "88888888"; // pior caso: 8 dígitos, todos os segmentos
  const svg = buildLayoutSvg(LAYOUT, ART_B64, "#fff", false, label);
  const group = svg.match(/<g id="sequence-number"[^>]*>(.*?)<\/g>/s)![1];
  const c = LAYOUT.artCenter;
  const rects = [...group.matchAll(/x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)];
  assert(rects.length > 0);
  for (const m of rects) {
    const [x, y, w, h] = m.slice(1).map(Number);
    for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
      const dist = Math.hypot(px - c, py - c);
      assert(dist > LAYOUT.visibleRadiusPx, `canto (${px},${py}) invade o visível`);
      assert(dist < LAYOUT.artCenter, `canto (${px},${py}) vaza da arte`);
      assert(py > LAYOUT.visibleRadiusPx + c - 1 || dist > LAYOUT.visibleRadiusPx);
    }
  }
});

Deno.test("número: centro vertical na faixa inferior da sangria", () => {
  const b = numberBox(LAYOUT, "12");
  assertEquals(b.cx, LAYOUT.artCenter);
  assert(b.cy > LAYOUT.artCenter + LAYOUT.visibleRadiusPx, "cy abaixo do círculo visível");
  assert(b.cy < LAYOUT.artPx, "cy dentro da arte");
  assertEquals(b.cy, LAYOUT.artPx - LAYOUT.bleedPx / 2);
});
