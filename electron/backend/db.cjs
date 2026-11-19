// Backend local (ADR-033) — abre o SQLite no userData do app e orquestra as
// operações (banco + arquivos) que o renderer consome via IPC.
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { join } = require('node:path');
const schema = require('./schema.cjs');
const storage = require('./storage.cjs');

let db = null;

/** Abre (uma vez) o banco local em userData/starbottons.db e migra o schema. */
function open() {
  if (db) {
    return db;
  }
  const { app } = require('electron'); // require tardio (fora do Electron em teste)
  const file = join(app.getPath('userData'), 'starbottons.db');
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;'); // concorrência/robustez
  schema.migrate(db);
  return db;
}

/** Extensão a partir do mime (só PNG/JPEG são aceitos nos fundos). */
function extOf(mime) {
  return mime === 'image/jpeg' ? '.jpg' : '.png';
}

module.exports = {
  open,

  // print_specs (catálogo; usado pela geração no futuro)
  listPrintSpecs: () => schema.listPrintSpecs(open()),

  // background_templates (biblioteca de fundos)
  listBackgrounds: () => schema.listBackgrounds(open()),
  saveBackground: ({ name, bytes, mime, width, height }) => {
    const storagePath = storage.save(bytes, extOf(mime));
    return schema.insertBackground(open(), {
      id: randomUUID(),
      name,
      storagePath,
      mime,
      bytes: bytes?.byteLength ?? bytes?.length ?? null,
      width,
      height,
    });
  },
  removeBackground: (id) => {
    const storagePath = schema.deleteBackground(open(), id);
    if (storagePath) {
      storage.remove(storagePath);
    }
  },

  // leitura de mídia (bytes -> o renderer monta um blob URL p/ exibir)
  readMedia: (name) => storage.read(name),
};
