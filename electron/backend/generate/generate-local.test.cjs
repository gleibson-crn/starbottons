// Teste Node da GERAÇÃO LOCAL ponta a ponta (ADR-034 F1+F4): exercita o mesmo
// caminho de `db.generate` — schema (uploads/renders/getPrintSpec) + storage +
// renderArtwork — sem Electron. db.cjs só adiciona o `require('electron')` para
// o caminho do userData; a LÓGICA está aqui coberta.
//
//   node electron/backend/generate/generate-local.test.cjs
const assert = require('node:assert');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

// storage.cjs usa SB_MEDIA_DIR quando definido (sem Electron).
process.env.SB_MEDIA_DIR = mkdtempSync(join(tmpdir(), 'sb-gen-'));

const { DatabaseSync } = require('node:sqlite');
const { Image } = require('imagescript');
const schema = require('../schema.cjs');
const storage = require('../storage.cjs');
const { renderArtwork, frameOpts } = require('./render.cjs');
const { assertSafeSource } = require('./image-header.cjs');

const PHYS = [0x70, 0x48, 0x59, 0x73];
function contains(bytes, seq) {
  outer: for (let i = 0; i + seq.length <= bytes.length; i++) {
    for (let j = 0; j < seq.length; j++) if (bytes[i + j] !== seq[j]) continue outer;
    return true;
  }
  return false;
}

async function samplePng(w, h, rgba) {
  const img = new Image(w, h);
  img.fill(rgba);
  return img.encode();
}

/** Replica a orquestração de db.generate (sem o require('electron')). */
async function generate(db, body) {
  const spec = schema.getPrintSpec(db, body.shape_key, body.size_mm);
  assert.ok(spec, 'getPrintSpec deve achar a spec');
  const sourcePath = schema.getUploadPath(db, body.upload_id);
  const source = storage.read(sourcePath);
  assert.ok(source, 'origem deve estar no storage');
  const bgPath = body.options.backgroundImage;
  let background = null;
  if (bgPath) {
    const b = storage.read(bgPath);
    if (b) {
      assertSafeSource(b);
      background = b;
    }
  }
  const frames = [];
  for (const f of body.options.frames ?? []) {
    const b = storage.read(f.path);
    if (b && assertSafeSource(b).mime === 'image/png') {
      frames.push({ bytes: b, opts: frameOpts(f) });
    }
  }
  const art = await renderArtwork(spec, body.options, source, background, frames);
  const path = storage.save(art.bytes, '.png');
  schema.upsertRender(db, {
    jobId: body.job_id,
    storagePath: path,
    widthPx: art.width_px,
    heightPx: art.height_px,
    dpi: art.dpi,
  });
  return { path, width_px: art.width_px, height_px: art.height_px, dpi: art.dpi };
}

async function main() {
  const db = new DatabaseSync(':memory:');
  schema.migrate(db);

  // getPrintSpec: 32mm semeado; tamanho inexistente -> null.
  assert.ok(schema.getPrintSpec(db, 'round', 32), '32mm existe');
  assert.strictEqual(schema.getPrintSpec(db, 'round', 999), null, '999mm não existe');

  // upload: salva o original + registra a linha.
  const srcBytes = await samplePng(400, 300, 0x3366ffff);
  const srcPath = storage.save(srcBytes, '.png');
  const up = schema.insertUpload(db, {
    id: 'up-1',
    storagePath: srcPath,
    filename: 'foto.png',
    mime: 'image/png',
    width: 400,
    height: 300,
    bytes: srcBytes.length,
  });
  assert.strictEqual(up.id, 'up-1');
  assert.strictEqual(schema.getUploadPath(db, 'up-1'), srcPath);

  // fundo (imagem) + 1 moldura PNG com alfa, ambos no storage.
  const bgPath = storage.save(await samplePng(500, 500, 0x11998899), '.png');
  const framePath = storage.save(await new Image(480, 480).encode(), '.png');

  const body = {
    job_id: 'job-xyz',
    upload_id: 'up-1',
    shape_key: 'round',
    size_mm: 32,
    options: {
      background: '#ff8800',
      scale: 1.1,
      rotation: 3,
      sequenceLabel: '007',
      backgroundImage: bgPath,
      frames: [{ path: framePath, offset: { x: 0, y: 0 }, scale: 1, rotation: 0 }],
    },
  };

  const res = await generate(db, body);
  const bytes = storage.read(res.path);
  assert.ok(bytes && bytes[0] === 0x89, 'print_png gravado e legível');
  assert.ok(contains(bytes, PHYS), 'print_png com chunk pHYs (DPI)');
  console.log('OK generate local:', bytes.length, 'bytes', res.width_px + 'px @' + res.dpi);

  // renderPath (freshPrintUrl após recarregar o lote).
  assert.strictEqual(schema.getRenderPath(db, 'job-xyz'), res.path, 'getRenderPath = path salvo');
  assert.strictEqual(schema.getRenderPath(db, 'nope'), null, 'job inexistente -> null');

  // UPSERT idempotente: regerar o mesmo job troca o path, não duplica.
  const res2 = await generate(db, body);
  assert.notStrictEqual(res2.path, res.path, 'novo arquivo a cada geração');
  assert.strictEqual(schema.getRenderPath(db, 'job-xyz'), res2.path, 'render atualizado (UPSERT)');
  const rows = db.prepare('select count(*) as n from renders').get();
  assert.strictEqual(rows.n, 1, 'uma linha por job_id (UPSERT)');

  db.close();
  console.log('\nGERAÇÃO LOCAL OK: uploads + renderArtwork + renders (UPSERT por job_id).');
}

main().catch((e) => {
  console.error('GERAÇÃO LOCAL FALHOU:', e);
  process.exit(1);
});
