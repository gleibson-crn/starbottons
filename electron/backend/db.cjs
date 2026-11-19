// Backend local (ADR-033) — abre o SQLite no userData do app e expõe as queries.
// Embrulha o schema.cjs (puro) com o caminho do arquivo e o ciclo do Electron.
const { DatabaseSync } = require('node:sqlite');
const { app } = require('electron');
const { join } = require('node:path');
const schema = require('./schema.cjs');

let db = null;

/** Abre (uma vez) o banco local em userData/starbottons.db e migra o schema. */
function open() {
  if (db) {
    return db;
  }
  const file = join(app.getPath('userData'), 'starbottons.db');
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;'); // concorrência/robustez
  schema.migrate(db);
  return db;
}

module.exports = {
  open,
  listPrintSpecs: () => schema.listPrintSpecs(open()),
};
