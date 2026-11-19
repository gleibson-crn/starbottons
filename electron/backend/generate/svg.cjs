/**
 * Monta o SVG de layout da arte de impressão (porte fiel de generate-art/svg.ts).
 *
 * Camadas (de baixo p/ cima): papel branco → cor de fundo (recorte circular) →
 * imagem composta (arte+fundo+moldura) → clareamento da sangria (economia de
 * tinta) → número de controle → linha de corte → guias opcionais.
 */

const { digitsBlock } = require('./digits.cjs');

const GUIDE_STROKE = Math.max(1, Math.round(1));

/** Fração de clareamento (mistura com BRANCO) da SANGRIA — economia de tinta. */
const BLEED_LIGHTEN = 0.5;

/** Subcaminho de um círculo completo (dois arcos de 180°) centrado em (c,c). */
function circlePath(c, r) {
  return `M ${c - r} ${c} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
}

/** Clareia a SANGRIA (anel fora do círculo visível, dentro da arte). */
function bleedLightenRing(l) {
  const c = l.artCenter;
  const d = `${circlePath(c, l.artCenter)} ${circlePath(c, l.visibleRadiusPx)}`;
  return `<path d="${d}" fill="#ffffff" fill-opacity="${BLEED_LIGHTEN}" fill-rule="evenodd" clip-path="url(#artClip)"/>`;
}

/** Espessura (px) da linha de corte — fina, proporcional ao tamanho da arte. */
function cutStroke(l) {
  return Math.max(1, Math.round(l.artPx * 0.004));
}

/** Escapa aspas/e-comercial para uso seguro dentro de atributos XML. */
function xmlAttr(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Linha de corte: circunferência tracejada no diâmetro da arte. */
function cutLine(l) {
  const c = l.artCenter;
  const w = cutStroke(l);
  const r = c - w / 2;
  return `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#111827" stroke-width="${w}" stroke-dasharray="${w * 4} ${w * 3}"/>`;
}

/** Círculos-guia: sangria (borda da arte), corte (visível) e área segura. */
function guides(l) {
  const c = l.artCenter;
  return [
    `<circle cx="${c}" cy="${c}" r="${l.artCenter - 0.5}" fill="none" stroke="#00e5ff" stroke-width="${GUIDE_STROKE}" stroke-dasharray="6 6"/>`,
    `<circle cx="${c}" cy="${c}" r="${l.visibleRadiusPx}" fill="none" stroke="#ff2d55" stroke-width="${GUIDE_STROKE}" stroke-dasharray="4 4"/>`,
    `<circle cx="${c}" cy="${c}" r="${l.safeRadiusPx}" fill="none" stroke="#34c759" stroke-width="${GUIDE_STROKE}" stroke-dasharray="2 4"/>`,
  ].join('');
}

const NUMBER_COLOR = '#111827';

/** Geometria do NÚMERO de controle na faixa inferior da sangria. */
function numberBox(l, label) {
  const h = Math.max(4, l.bleedPx * 0.55);
  const cx = l.artCenter;
  const cy = l.artPx - l.bleedPx / 2;
  const yb = cy + h / 2 - l.artCenter;
  const rMax = l.artCenter - cutStroke(l) - 1;
  const half = rMax > Math.abs(yb) ? Math.sqrt(rMax * rMax - yb * yb) : 0;
  return { cx, cy, h, maxWidth: 2 * half, color: NUMBER_COLOR, label };
}

/** NÚMERO de controle (vetor 7-seg) na SANGRIA inferior. Vazio se sem dígitos. */
function numberLabel(l, label) {
  if (!label) return '';
  const b = numberBox(l, label);
  return digitsBlock(label, b.cx, b.cy, b.h, b.color, b.maxWidth).svg;
}

/**
 * @param composedPngBase64 imagem da arte já redimensionada para artPx (sem
 *                          `data:`) — inclui fundo e moldura quando houver.
 * @param background        cor de base/fallback do fundo (options.background).
 * @param withGuides        inclui guias extras para conferência.
 * @param sequenceLabel     número (só dígitos) desenhado na sangria, opcional.
 */
function buildLayoutSvg(l, composedPngBase64, background, withGuides = false, sequenceLabel) {
  const c = l.artCenter;
  const size = l.artPx;
  const href = `data:image/png;base64,${composedPngBase64}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs><clipPath id="artClip"><circle cx="${c}" cy="${c}" r="${l.artCenter}"/></clipPath></defs>
<rect width="${size}" height="${size}" fill="#ffffff"/>
<rect width="${size}" height="${size}" fill="${xmlAttr(background)}" clip-path="url(#artClip)"/>
<image href="${href}" x="0" y="0" width="${size}" height="${size}" clip-path="url(#artClip)" preserveAspectRatio="xMidYMid slice"/>
${bleedLightenRing(l)}
${numberLabel(l, sequenceLabel ?? '')}
${cutLine(l)}
${withGuides ? guides(l) : ''}
</svg>`;
}

module.exports = { BLEED_LIGHTEN, numberBox, numberLabel, buildLayoutSvg };
