/**
 * Monta o SVG de layout da arte de impressão a partir do layout derivado.
 *
 * Camadas (de baixo p/ cima):
 *  1. Papel BRANCO cobrindo o quadrado inteiro. Deixa o PNG 100% opaco (sem
 *     alpha nos cantos → nada de "xadrez" em visualizadores) e, por ser branco,
 *     NÃO gasta tinta (impressora não deposita branco sobre papel branco). Os
 *     cantos ficam fora do botton → não imprimem cor à toa.
 *  2. Fundo de COR (options.background) recortado ao CÍRCULO da arte — a área
 *     que de fato vira o botton (face + sangria de dobra). Base/fallback.
 *  3. (OPCIONAL) IMAGEM de fundo (cena/foto), COVER preenchendo o círculo
 *     inteiro (preserveAspectRatio slice), recortada ao mesmo círculo. Fica SOB
 *     a arte do usuário; NÃO recebe o transform de enquadramento (só a arte
 *     recebe). Só entra quando há `backgroundImage`.
 *  4. A imagem composta da arte do usuário (PNG base64), recortada ao círculo.
 *  5. LINHA DE CORTE: circunferência no diâmetro da arte, marcando onde recortar
 *     (o botton é redondo). Sempre presente na saída — sem ela o operador não
 *     sabe o tamanho de corte.
 *  6. Guias extras (só quando `withGuides`, p/ conferência): sangria, corte
 *     (visível) e área segura, em cores distintas.
 */

import type { ArtLayout } from "./types.ts";

/** Imagem de fundo já baixada: base64 cru + mime (resvg lê PNG e JPEG no href). */
export interface BackgroundImage {
  readonly b64: string;
  readonly mime: "image/png" | "image/jpeg";
}

const GUIDE_STROKE = Math.max(1, Math.round(1));

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

/**
 * Camada 3: imagem de fundo em COVER preenchendo o círculo da arte, recortada
 * ao `artClip`. Sem transform de enquadramento (o slice do SVG já faz o cover).
 * String vazia quando não há imagem de fundo.
 */
function backgroundImageLayer(
  size: number,
  bg: BackgroundImage | null | undefined,
): string {
  if (!bg) return "";
  return `<image href="data:${bg.mime};base64,${bg.b64}" x="0" y="0" width="${size}" height="${size}" clip-path="url(#artClip)" preserveAspectRatio="xMidYMid slice"/>`;
}

/**
 * @param composedPngBase64 imagem da arte já redimensionada para artPx (sem data:)
 * @param background         cor de base/fallback do fundo (options.background)
 * @param backgroundImage    camada de imagem de fundo opcional (null → só a cor)
 * @param withGuides         inclui as guias extras (sangria/visível/segura) além
 *                           da linha de corte, para conferência.
 */
export function buildLayoutSvg(
  l: ArtLayout,
  composedPngBase64: string,
  background: string,
  backgroundImage?: BackgroundImage | null,
  withGuides = false,
): string {
  const c = l.artCenter;
  const size = l.artPx;
  const href = `data:image/png;base64,${composedPngBase64}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs><clipPath id="artClip"><circle cx="${c}" cy="${c}" r="${l.artCenter}"/></clipPath></defs>
<rect width="${size}" height="${size}" fill="#ffffff"/>
<rect width="${size}" height="${size}" fill="${xmlAttr(background)}" clip-path="url(#artClip)"/>
${backgroundImageLayer(size, backgroundImage)}
<image href="${href}" x="0" y="0" width="${size}" height="${size}" clip-path="url(#artClip)" preserveAspectRatio="xMidYMid slice"/>
${cutLine(l)}
${withGuides ? guides(l) : ""}
</svg>`;
}
