// Teste do servidor estático (node electron/backend/static-server.test.cjs).
// Cria uma pasta temporária com index.html + um asset e confere: serve o asset,
// SPA fallback em rota sem arquivo, MIME de .wasm, e traversal barrado.
const assert = require('node:assert');
const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { startStaticServer } = require('./static-server.cjs');

async function run() {
  const root = mkdtempSync(join(tmpdir(), 'sb-static-'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><app-root></app-root>');
  mkdirSync(join(root, 'ort'), { recursive: true });
  writeFileSync(join(root, 'ort', 'x.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d]));
  // Arquivo "secreto" fora da raiz (um nível acima) p/ provar o anti-traversal.
  const secret = join(root, '..', `sb-secret-${process.pid}.txt`);
  writeFileSync(secret, 'TOP_SECRET');

  const { url, close } = await startStaticServer(root);
  try {
    const index = await fetch(url + '/');
    assert.strictEqual(index.status, 200);
    assert.match(index.headers.get('content-type'), /text\/html/);
    assert.match(await index.text(), /<app-root>/);

    const deep = await fetch(url + '/app/mockup/123'); // rota sem arquivo
    assert.match(await deep.text(), /<app-root>/, 'SPA fallback deve servir index');

    const wasm = await fetch(url + '/ort/x.wasm');
    assert.strictEqual(wasm.headers.get('content-type'), 'application/wasm');
    await wasm.body.cancel();

    const trav = await fetch(url + `/..%2fsb-secret-${process.pid}.txt`);
    const travBody = await trav.text();
    assert.ok(!travBody.includes('TOP_SECRET'), 'traversal NAO pode vazar arquivo de fora da raiz');
    assert.match(travBody, /<app-root>/, 'traversal deve cair no index');
  } finally {
    close();
    rmSync(root, { recursive: true, force: true });
    rmSync(secret, { force: true });
  }
  console.log('static-server.test.cjs: OK');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
