/**
 * Rasteriza o SVG de layout → PNG (RGBA) via @resvg/resvg-wasm e marca a DPI
 * (pHYs). Porte de generate-art/raster.ts.
 *
 * Diferença Deno→Node: o pacote npm traz o `.wasm` junto; inicializamos uma vez
 * com `initWasm(readFileSync(index_bg.wasm))` — sem a interceptação de fetch que
 * a edge precisava (wasm-local.ts fica fora do porte).
 */

const { readFileSync } = require('node:fs');
const path = require('node:path');
const { Resvg, initWasm } = require('@resvg/resvg-wasm');
const { withDpi } = require('./png.cjs');

let wasmReady = null;

/** Resolve o caminho do index_bg.wasm empacotado no pacote npm. */
function resvgWasmPath() {
  try {
    return require.resolve('@resvg/resvg-wasm/index_bg.wasm');
  } catch {
    return path.join(
      __dirname,
      '..',
      '..',
      '..',
      'node_modules',
      '@resvg',
      'resvg-wasm',
      'index_bg.wasm',
    );
  }
}

/** Inicializa o WASM do resvg uma única vez por processo (idempotente). */
function ensureWasm() {
  if (!wasmReady) {
    wasmReady = initWasm(readFileSync(resvgWasmPath()));
  }
  return wasmReady;
}

/**
 * @param svg tamanho já é artPx×artPx (fitTo original).
 * @returns PNG com chunk pHYs na dpi informada.
 */
async function rasterizeSvg(svg, dpi) {
  await ensureWasm();
  const resvg = new Resvg(svg, { fitTo: { mode: 'original' } });
  const png = resvg.render().asPng();
  return withDpi(png, dpi);
}

module.exports = { rasterizeSvg };
