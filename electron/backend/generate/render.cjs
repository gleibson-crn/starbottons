/**
 * Orquestra a COMPUTAÇÃO da arte de impressão (porte de generate-art/render.ts,
 * só a parte pura): origem (+fundo +molduras já carregados) → compõe → SVG de
 * layout → PNG@dpi com pHYs.
 *
 * O I/O (baixar origem/fundo/molduras, gravar o asset) fica no processo MAIN do
 * Electron (db.cjs/storage.cjs) e chama `renderArtwork` com os BYTES prontos —
 * mantendo este módulo determinístico e testável sem Electron/Supabase.
 */

const { computeLayout } = require('./geometry.cjs');
const { composeArtwork } = require('./image.cjs');
const { buildLayoutSvg } = require('./svg.cjs');
const { rasterizeSvg } = require('./raster.cjs');

/** Enquadramento do FUNDO a partir das options (defaults = cover fixo/centrado). */
function backgroundOpts(options) {
  return {
    offset: options.backgroundOffset ?? { x: 0, y: 0 },
    scale: options.backgroundScale ?? 1,
    rotation: options.backgroundRotation ?? 0,
  };
}

/** Enquadramento (offset MM/scale/rotation) de UMA moldura → TransformOpts. */
function frameOpts(frame) {
  return {
    offset: frame.offset ?? { x: 0, y: 0 },
    scale: frame.scale ?? 1,
    rotation: frame.rotation ?? 0,
  };
}

/** Rasteriza o PNG da arte a partir da origem já baixada (+ fundo/molduras). */
async function renderPrintPng(source, layout, options, backgroundBytes, frames) {
  const composedB64 = await composeArtwork(
    source,
    layout.artPx,
    layout.dpi,
    {
      offset: options.offset ?? { x: 0, y: 0 },
      scale: options.scale ?? 1,
      rotation: options.rotation ?? 0,
      flipH: options.flipH,
      flipV: options.flipV,
    },
    backgroundBytes,
    backgroundOpts(options),
    frames,
    // Toda moldura cobre o círculo VISÍVEL (corte), não a sangria → paridade
    // com o preview do editor.
    layout.visiblePx,
  );
  const svg = buildLayoutSvg(
    layout,
    composedB64,
    options.background ?? '#ffffff',
    false,
    options.sequenceLabel,
  );
  return rasterizeSvg(svg, layout.dpi);
}

/**
 * Pipeline completo de COMPUTAÇÃO. Recebe os bytes já carregados (o main faz o
 * I/O) e devolve o descritor do asset `print_png`.
 *
 * @param spec            print_spec (shape/visible_mm/art_diameter_mm/…)
 * @param options         ArtOptions (offset/scale/rotation/background/…)
 * @param sourceBytes     bytes da imagem de origem
 * @param backgroundBytes bytes do fundo ou null
 * @param frames          [{ bytes, opts }] já carregadas (ordem = z-order)
 */
async function renderArtwork(spec, options, sourceBytes, backgroundBytes, frames) {
  const layout = computeLayout(spec);
  const bytes = await renderPrintPng(
    sourceBytes,
    layout,
    options,
    backgroundBytes ?? null,
    frames ?? [],
  );
  return {
    bytes,
    width_px: layout.artPx,
    height_px: layout.artPx,
    dpi: layout.dpi,
  };
}

module.exports = { backgroundOpts, frameOpts, renderPrintPng, renderArtwork };
