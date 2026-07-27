/**
 * Monta o SVG de layout da arte de impressão a partir do layout derivado.
 *
 * Camadas (de baixo p/ cima):
 *  1. Fundo cor sólida (options.background) cobrindo o QUADRADO INTEIRO da arte
 *     — inclusive os cantos fora do círculo. Deixa o PNG de saída 100% opaco
 *     (sem alpha nos cantos, que apareceria como "xadrez" em visualizadores) e
 *     garante sangria de fundo se o corte físico sair levemente torto.
 *  2. A imagem já composta (PNG base64) ocupando a arte inteira, recortada
 *     pela máscara circular da área VISÍVEL + sangria (círculo da arte).
 *  3. Guias (só referência visual, fora do corte físico): anel de sangria,
 *     círculo de corte (área visível) e círculo de área segura.
 */

import type { ArtLayout } from "./types.ts";

const GUIDE_STROKE = Math.max(1, Math.round(1));

/** Escapa aspas/e-comercial para uso seguro dentro de atributos XML. */
function xmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(
    /</g,
    "&lt;",
  );
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

/**
 * @param composedPngBase64 imagem já redimensionada para artPx (sem prefixo data:)
 * @param withGuides         inclui guias de corte/segurança (preview) — a arte
 *                           final de gráfica normalmente vai SEM guias.
 */
export function buildLayoutSvg(
  l: ArtLayout,
  composedPngBase64: string,
  background: string,
  withGuides = false,
): string {
  const c = l.artCenter;
  const size = l.artPx;
  const href = `data:image/png;base64,${composedPngBase64}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs><clipPath id="artClip"><circle cx="${c}" cy="${c}" r="${l.artCenter}"/></clipPath></defs>
<rect width="${size}" height="${size}" fill="${xmlAttr(background)}"/>
<image href="${href}" x="0" y="0" width="${size}" height="${size}" clip-path="url(#artClip)" preserveAspectRatio="xMidYMid slice"/>
${withGuides ? guides(l) : ""}
</svg>`;
}
