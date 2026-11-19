// Teste de render COMPLETO no Node (ADR-034, Fase 3): prova que a computação
// pura portada (geometry → image/ImageScript → svg → raster/resvg → pHYs) gera
// um PNG 300 DPI válido, com e sem fundo/moldura. Sem Electron, sem Supabase.
//
//   node electron/backend/generate/render.test.cjs
const assert = require('node:assert');
const { Image } = require('imagescript');
const { renderArtwork } = require('./render.cjs');
const { computeLayout } = require('./geometry.cjs');

/** print_spec realista de um botton redondo de 32 mm (visível) @300 DPI. */
const SPEC = {
  shape: 'round',
  visible_mm: 32,
  art_diameter_mm: 44,
  bleed_mm: 6,
  safe_mm: 3,
  dpi_target: 300,
};

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PHYS = [0x70, 0x48, 0x59, 0x73]; // "pHYs"

function isPng(bytes) {
  return PNG_SIG.every((b, i) => bytes[i] === b);
}

/** Procura a sequência `seq` em `bytes` (byte a byte). */
function contains(bytes, seq) {
  outer: for (let i = 0; i + seq.length <= bytes.length; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (bytes[i + j] !== seq[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** Gera um PNG de teste `w×h` preenchido com uma cor RGBA. */
async function samplePng(w, h, rgba) {
  const img = new Image(w, h);
  img.fill(rgba);
  return img.encode();
}

async function main() {
  const layout = computeLayout(SPEC);
  console.log('layout: artPx', layout.artPx, 'visiblePx', layout.visiblePx, 'dpi', layout.dpi);
  assert.strictEqual(layout.artPx, Math.round((44 / 25.4) * 300), 'artPx esperado');

  // 1) Só arte (origem) + cor de fundo + número de controle.
  const source = await samplePng(400, 300, 0x3366ffff);
  const r1 = await renderArtwork(SPEC, { background: '#ff8800', sequenceLabel: '042' }, source);
  assert.ok(isPng(r1.bytes), 'print_png deve ser PNG válido');
  assert.ok(contains(r1.bytes, PHYS), 'print_png deve conter chunk pHYs (DPI)');
  assert.strictEqual(r1.width_px, layout.artPx, 'width_px = artPx');
  assert.strictEqual(r1.height_px, layout.artPx, 'height_px = artPx');
  assert.strictEqual(r1.dpi, 300, 'dpi marcado');
  console.log('OK render só-arte:', r1.bytes.length, 'bytes', r1.width_px + 'px');

  // 2) Arte + fundo (imagem) + 1 moldura PNG com alfa (miolo transparente).
  const background = await samplePng(600, 600, 0x11998899); // fundo semi
  const frame = new Image(500, 500); // alfa 0 (transparente) por padrão
  const frameBytes = await frame.encode();
  const r2 = await renderArtwork(
    SPEC,
    { background: '#000000', scale: 1.1, rotation: 5, flipH: true },
    source,
    background,
    [{ bytes: frameBytes, opts: { offset: { x: 0, y: 0 }, scale: 1, rotation: 0 } }],
  );
  assert.ok(isPng(r2.bytes), 'print_png (com fundo+moldura) deve ser PNG válido');
  assert.ok(contains(r2.bytes, PHYS), 'print_png (com fundo+moldura) deve conter pHYs');
  console.log('OK render arte+fundo+moldura:', r2.bytes.length, 'bytes');

  console.log('\nRENDER COMPLETO OK: pipeline Deno→Node portado roda no Node.');
}

main().catch((e) => {
  console.error('RENDER TESTE FALHOU:', e);
  process.exit(1);
});
