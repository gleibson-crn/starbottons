// Spike/smoke do WASM no Node (ADR-034, Fase 2 — o RISCO): prova que o
// ImageScript compõe um PNG e que o resvg (WASM) rasteriza um SVG, rodando no
// Node — sem a gambiarra de interceptar fetch que a Deno precisava.
//
//   node electron/backend/generate/wasm-smoke.cjs
const assert = require('node:assert');
const { readFileSync } = require('node:fs');

/** PNG começa com a assinatura \x89PNG\r\n\x1a\n. */
function isPng(bytes) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return sig.every((b, i) => bytes[i] === b);
}

async function main() {
  // 1) ImageScript: cria uma imagem, preenche, codifica PNG e re-decodifica.
  const { Image } = require('imagescript');
  const img = new Image(64, 64);
  img.fill(0xff3366ff); // rosa opaco (RGBA)
  const pngFromImageScript = await img.encode();
  assert.ok(isPng(pngFromImageScript), 'ImageScript deve produzir PNG válido');
  const decoded = await Image.decode(pngFromImageScript);
  assert.strictEqual(decoded.width, 64, 'ImageScript re-decodifica (largura)');
  console.log('OK ImageScript: compôs e re-decodificou PNG', pngFromImageScript.length, 'bytes');

  // 2) resvg (WASM): inicializa e rasteriza um SVG simples em PNG.
  const { Resvg, initWasm } = require('@resvg/resvg-wasm');
  let wasmPath;
  try {
    wasmPath = require.resolve('@resvg/resvg-wasm/index_bg.wasm');
  } catch {
    wasmPath = require('node:path').join(
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
  await initWasm(readFileSync(wasmPath));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="36" fill="#7c3aef"/></svg>';
  const pngFromResvg = new Resvg(svg).render().asPng();
  assert.ok(isPng(pngFromResvg), 'resvg deve rasterizar o SVG em PNG válido');
  console.log('OK resvg: rasterizou SVG -> PNG', pngFromResvg.length, 'bytes');

  console.log('SPIKE OK: ImageScript + resvg rodam no Node. Port de generate-art é viável.');
}

main().catch((e) => {
  console.error('SPIKE FALHOU:', e);
  process.exit(1);
});
