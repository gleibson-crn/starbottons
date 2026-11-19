/**
 * Decodifica a origem (PNG/JPEG) e compõe sobre um canvas quadrado artPx×artPx
 * com fit:cover + scale + rotation + offset (porte fiel de generate-art/image.ts).
 * Devolve o PNG resultante em base64 para embutir no SVG de layout.
 *
 * GOTCHA do porte Deno→Node: o imagescript npm (v3) expõe `decode(bytes)` como
 * auto-detect (não `decodeImage`). A API de instância (resize/flip/rotate/
 * composite/encode) é compatível com a 1.3.0 da edge.
 */

const { Image, decode } = require('imagescript');
const { mmToPx } = require('./geometry.cjs');
const { assertSafeSource } = require('./image-header.cjs');

/** Sem transform: cover puro, centrado. */
const DEFAULT_BG_OPTS = { offset: { x: 0, y: 0 }, scale: 1, rotation: 0 };

/** Teto do maior lado da MOLDURA (px) — espelha BACKGROUND_MAX_DIM do client. */
const FRAME_MAX_DIM = 1000;

/** Reduz `img` para caber em `max`px no maior lado, preservando proporção e alfa. */
function clampToMax(img, max) {
  const longest = Math.max(img.width, img.height);
  if (longest <= max) return img;
  const factor = max / longest;
  return img.resize(
    Math.max(1, Math.round(img.width * factor)),
    Math.max(1, Math.round(img.height * factor)),
  );
}

/** Fator de cobertura: menor escala que faz a imagem cobrir o canvas todo. */
function coverScale(srcW, srcH, target) {
  return Math.max(target / srcW, target / srcH);
}

/** Aplica cover + scale do usuário e (opcional) flip/rotação. */
function transformSource(src, coverTarget, opts) {
  const factor = coverScale(src.width, src.height, coverTarget) * (opts.scale || 1);
  const w = Math.max(1, Math.round(src.width * factor));
  const h = Math.max(1, Math.round(src.height * factor));
  const scaled = src.resize(w, h);
  // Ordem canônica: resize → flip (in-place) → rotate.
  if (opts.flipH) scaled.flip('horizontal');
  if (opts.flipV) scaled.flip('vertical');
  return opts.rotation ? scaled.rotate(opts.rotation) : scaled;
}

/** Compõe a imagem transformada centralizada + offset (MM) sobre o canvas. */
function composeOntoCanvas(canvas, layer, artPx, dpi, opts) {
  const offsetXpx = mmToPx(opts.offset?.x ?? 0, dpi);
  const offsetYpx = mmToPx(opts.offset?.y ?? 0, dpi);
  const cx = Math.round((artPx - layer.width) / 2) + offsetXpx;
  const cy = Math.round((artPx - layer.height) / 2) + offsetYpx;
  canvas.composite(layer, cx, cy);
}

/** Decodifica, transforma e compõe UM layer sobre o canvas com seu offset (MM). */
async function composeLayer(canvas, bytes, artPx, dpi, opts, maxDim, coverTarget) {
  const decoded = await decode(bytes);
  const img = maxDim ? clampToMax(decoded, maxDim) : decoded;
  const layer = transformSource(img, coverTarget ?? artPx, opts);
  composeOntoCanvas(canvas, layer, artPx, dpi, opts);
}

/**
 * Pipeline completo: bytes de origem (+ fundo e molduras opcionais) → PNG base64.
 * Ordem das camadas: canvas transparente → fundo → arte → molduras (até 3, em
 * ordem do array = z-order; cada uma COVER no círculo visível `frameCoverPx`).
 */
async function composeArtwork(
  sourceBytes,
  artPx,
  dpi,
  opts,
  backgroundBytes,
  bgOpts,
  frames,
  frameCoverPx,
) {
  // Valida magic bytes + teto de MP pelo HEADER antes de alocar o bitmap.
  assertSafeSource(sourceBytes);
  const canvas = new Image(artPx, artPx); // transparente por padrão
  if (backgroundBytes) {
    await composeLayer(canvas, backgroundBytes, artPx, dpi, bgOpts ?? DEFAULT_BG_OPTS);
  }
  await composeLayer(canvas, sourceBytes, artPx, dpi, opts);
  for (const frame of frames ?? []) {
    await composeLayer(
      canvas,
      frame.bytes,
      artPx,
      dpi,
      frame.opts,
      FRAME_MAX_DIM,
      frameCoverPx ?? artPx,
    );
  }
  const png = await canvas.encode();
  return Buffer.from(png).toString('base64');
}

module.exports = { FRAME_MAX_DIM, composeArtwork };
