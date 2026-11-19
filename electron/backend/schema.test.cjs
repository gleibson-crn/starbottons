// Teste do backend local (ADR-033) — roda com `node electron/backend/schema.test.cjs`.
// Usa node:sqlite (Node 22+/Electron); não depende do Electron nem do Angular.
const assert = require('node:assert');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const {
  migrate,
  listPrintSpecs,
  listBackgrounds,
  insertBackground,
  deleteBackground,
} = require('./schema.cjs');

const db = new DatabaseSync(':memory:');
migrate(db);
migrate(db); // idempotência

// print_specs (catálogo semeado)
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

// background_templates (CRUD)
assert.strictEqual(listBackgrounds(db).length, 0, 'fundos começam vazios');
const id = randomUUID();
const row = insertBackground(db, {
  id,
  name: 'Fundo Teste',
  storagePath: 'abc.png',
  mime: 'image/png',
  bytes: 123,
  width: 800,
  height: 600,
});
assert.strictEqual(row.name, 'Fundo Teste', 'insere e devolve a linha');
assert.strictEqual(row.width_px, 800, 'largura persistida');
assert.strictEqual(listBackgrounds(db).length, 1, 'lista com 1 fundo');
assert.strictEqual(deleteBackground(db, id), 'abc.png', 'delete devolve o storage_path');
assert.strictEqual(listBackgrounds(db).length, 0, 'lista vazia após delete');
assert.throws(
  () => insertBackground(db, { id: randomUUID(), name: 'x', storagePath: 'y', mime: 'image/webp' }),
  'CHECK barra mime webp',
);

console.log('OK: backend local (print_specs + background_templates).');
