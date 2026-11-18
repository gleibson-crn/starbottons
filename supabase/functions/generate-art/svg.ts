/**
 * Monta o SVG de layout da arte de impressão a partir do layout derivado.
 *
 * Camadas (de baixo p/ cima):
 *  1. Papel BRANCO cobrindo o quadrado inteiro. Deixa o PNG 100% opaco (sem
 *     alpha nos cantos → nada de "xadrez" em visualizadores) e, por ser branco,
 *     NÃO gasta tinta (impressora não deposita branco sobre papel branco). Os
 *     cantos ficam fora do botton → não imprimem cor à toa.
 *  2. Fundo de COR (options.background) recortado ao CÍRCULO da arte — a área
 *     que de fato vira o botton (face + sangria de dobra). Base/fallback quando
 *     não há imagem de fundo (a imagem, quando existe, já vem composta DENTRO da
 *     arte em `composeArtwork`/ImageScript — mais barato que embutir outra
 *     imagem no SVG, que estourava o limite de CPU do worker da Edge).
 *  3. A imagem composta da arte do usuário (PNG base64) — que já inclui a imagem
 *     de fundo (sob a arte) e a MOLDURA (sobre a arte, no topo) quando houver,
 *     tudo composto DENTRO da arte em `composeArtwork`/ImageScript —, recortada
 *     ao círculo. Ordem embutida no PNG: cor base → fundo → arte → moldura.
 *  3b. ECONOMIA DE TINTA: anel branco a `BLEED_LIGHTEN` (50%) sobre a SANGRIA
 *     (fora do círculo visível/corte, dentro da arte). Essa área dobra para a
 *     traseira e não se vê; clareá-la reduz a cobertura de tinta sem afetar a
 *     face. Vem SOBRE a arte e ANTES da linha de corte.
 *  4. LINHA DE CORTE: circunferência no diâmetro da arte, marcando onde recortar
 *     (o botton é redondo). Sempre presente na saída — sem ela o operador não
 *     sabe o tamanho de corte.
 *  5. Guias extras (só quando `withGuides`, p/ conferência): sangria, corte
 *     (visível) e área segura, em cores distintas.
 */

import type { ArtLayout } from "./types.ts";
import { digitsBlock } from "./digits.ts";

const GUIDE_STROKE = Math.max(1, Math.round(1));

/**
 * Fração de clareamento (mistura com BRANCO) da SANGRIA — economia de tinta.
 * 0.5 = a sangria perde ~metade da cobertura de tinta; 1 seria branco total.
 */
export const BLEED_LIGHTEN = 0.5;

/** Subcaminho de um círculo completo (dois arcos de 180°) centrado em (c,c). */
function circlePath(c: number, r: number): string {
  return `M ${c - r} ${c} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
}

/**
 * ECONOMIA DE TINTA: clareia a SANGRIA — o anel FORA do círculo visível (corte)
 * e dentro da arte — pintando branco a `BLEED_LIGHTEN` por cima. Essa área dobra
 * para a traseira e não se vê; clareá-la reduz a tinta sem afetar a face.
 * Branco 50% sobre o pixel equivale a mix(px, branco, 0.5). Anel via `path`
 * com `fill-rule="evenodd"` (o círculo interno vira furo). Recortado ao artClip.
 */
function bleedLightenRing(l: ArtLayout): string {
  const c = l.artCenter;
  const d = `${circlePath(c, l.artCenter)} ${circlePath(c, l.visibleRadiusPx)}`;
  return `<path d="${d}" fill="#ffffff" fill-opacity="${BLEED_LIGHTEN}" fill-rule="evenodd" clip-path="url(#artClip)"/>`;
}

/** Espessura (px) da linha de corte — fina, proporcional ao tamanho da arte. */
function cutStroke(l: ArtLayout): number {
  return Math.max(1, Math.round(l.artPx * 0.004));
}

/** Escapa aspas/e-comercial para uso seguro dentro de atributos XML. */
function xmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(
    /</g,
    "&lt;",
  );
}

/**
 * Linha de corte: circunferência tracejada no diâmetro da arte (borda externa
 * do círculo impresso). Recuada meia-espessura para dentro para não ser cortada
 * pela borda do PNG. É a "circunferência delimitadora" do botton redondo.
 */
function cutLine(l: ArtLayout): string {
  const c = l.artCenter;
  const w = cutStroke(l);
  const r = c - w / 2;
  return `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#111827" stroke-width="${w}" stroke-dasharray="${w * 4} ${w * 3}"/>`;
}

/** Círculos-guia: sangria (borda da arte), corte (visível) e área segura. */
function guides(l: ArtLayout): string {
  const c = l.artCenter;
  return [
    `<circle cx="${c}" cy="${c}" r="${
      l.artCenter - 0.5
    }" fill="none" stroke="#00e5ff" stroke-width="${GUIDE_STROKE}" stroke-dasharray="6 6"/>`,
    `<circle cx="${c}" cy="${c}" r="${l.visibleRadiusPx}" fill="none" stroke="#ff2d55" stroke-width="${GUIDE_STROKE}" stroke-dasharray="4 4"/>`,
    `<circle cx="${c}" cy="${c}" r="${l.safeRadiusPx}" fill="none" stroke="#34c759" stroke-width="${GUIDE_STROKE}" stroke-dasharray="2 4"/>`,
  ].join("");
}

const NUMBER_COLOR = "#111827";

/**
 * Geometria do NÚMERO de controle na faixa inferior da sangria. Altura
 * h = 55% da sangria, centro em cy = artPx - bleedPx/2 → o topo do bloco fica
 * 0.225*bleed ABAIXO do círculo visível (y > c + visibleR); como o círculo
 * visível sobe para os lados, o topo nunca o invade. Largura limitada para o canto inferior do bloco não passar da
 * borda da arte (círculo de raio artCenter menos a espessura do corte).
 */
export function numberBox(l: ArtLayout, label: string) {
  const h = Math.max(4, l.bleedPx * 0.55);
  const cx = l.artCenter;
  const cy = l.artPx - l.bleedPx / 2;
  const yb = cy + h / 2 - l.artCenter; // offset vertical do canto inferior
  const rMax = l.artCenter - cutStroke(l) - 1;
  const half = rMax > Math.abs(yb) ? Math.sqrt(rMax * rMax - yb * yb) : 0;
  return { cx, cy, h, maxWidth: 2 * half, color: NUMBER_COLOR, label };
}

/**
 * NÚMERO de controle (vetor 7-seg) na SANGRIA inferior. Vazio se sem dígitos.
 * Vem depois do clareamento da sangria e antes da linha de corte.
 */
export function numberLabel(l: ArtLayout, label: string): string {
  if (!label) return "";
  const b = numberBox(l, label);
  return digitsBlock(label, b.cx, b.cy, b.h, b.color, b.maxWidth).svg;
}

/**
 * @param sequenceLabel     número (só dígitos) desenhado na sangria, opcional.
 * @param composedPngBase64 imagem da arte já redimensionada para artPx (sem
 *                          data:) — inclui a imagem de fundo quando houver.
 * @param background         cor de base/fallback do fundo (options.background)
 * @param withGuides         inclui as guias extras (sangria/visível/segura) além
 *                           da linha de corte, para conferência.
 */
export function buildLayoutSvg(
  l: ArtLayout,
  composedPngBase64: string,
  background: string,
  withGuides = false,
  sequenceLabel?: string,
): string {
  const c = l.artCenter;
  const size = l.artPx;
  const href = `data:image/png;base64,${composedPngBase64}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs><clipPath id="artClip"><circle cx="${c}" cy="${c}" r="${l.artCenter}"/></clipPath></defs>
<rect width="${size}" height="${size}" fill="#ffffff"/>
<rect width="${size}" height="${size}" fill="${xmlAttr(background)}" clip-path="url(#artClip)"/>
<image href="${href}" x="0" y="0" width="${size}" height="${size}" clip-path="url(#artClip)" preserveAspectRatio="xMidYMid slice"/>
${bleedLightenRing(l)}
${numberLabel(l, sequenceLabel ?? "")}
${cutLine(l)}
${withGuides ? guides(l) : ""}
</svg>`;
}
