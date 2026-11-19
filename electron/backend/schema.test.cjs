// Teste do backend local (ADR-033) — roda com `node electron/backend/schema.test.cjs`.
// Usa node:sqlite (Node 22+/Electron); não depende do Electron nem do Angular.
const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');
const { migrate, listPrintSpecs } = require('./schema.cjs');

const db = new DatabaseSync(':memory:');
migrate(db);
migrate(db); // idempotência

const specs = listPrintSpecs(db);
assert.strictEqual(specs.length, 3, 'deve haver 3 tamanhos semeados');
assert.deepStrictEqual(
  specs.map((s) => s.visible_mm),
  [32, 44, 58],
  'tamanhos 32/44/58 em ordem',
);
const s32 = specs.find((s) => s.visible_mm === 32);
assert.strictEqual(s32.art_diameter_mm, 44, 'arte do 32mm = 44mm');
assert.strictEqual(s32.dpi_target, 300, 'DPI alvo = 300');

console.log('OK: backend local (print_specs) — 3 tamanhos, seed idempotente.');
