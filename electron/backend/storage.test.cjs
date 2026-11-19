// Teste do armazenamento local (ADR-033) — roda com:
//   SB_MEDIA_DIR=<pasta temp> node electron/backend/storage.test.cjs
// Não depende do Electron (usa SB_MEDIA_DIR em vez do userData).
const assert = require('node:assert');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

process.env.SB_MEDIA_DIR = mkdtempSync(join(tmpdir(), 'sb-media-'));
const s = require('./storage.cjs');

const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // header PNG
const name = s.save(bytes, 'png');
assert.ok(name.endsWith('.png'), 'nome preserva extensão');
assert.ok(s.has(name), 'arquivo existe após salvar');

const back = s.read(name);
assert.ok(back && back.length === bytes.length && back[0] === 137, 'lê os mesmos bytes');

s.remove(name);
assert.ok(!s.has(name), 'arquivo some após remover');
s.remove(name); // idempotente

assert.strictEqual(s.safeName('../../etc/passwd'), 'passwd', 'bloqueia path traversal');

console.log('OK: armazenamento local — salva/lê/remove + traversal barrado.');
