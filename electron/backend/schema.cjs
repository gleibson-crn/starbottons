// Backend local (ADR-033) — schema + queries PUROS, sobre node:sqlite.
//
// Separado do Electron de propósito: recebe uma instância de DatabaseSync e não
// importa 'electron', para poder ser testado com node:sqlite diretamente.
// O `db.cjs` embrulha isto com o caminho do arquivo no userData do app.
//
// Esta é a FUNDAÇÃO da migração: começa pela tabela print_specs (catálogo de
// tamanhos, só leitura). As demais tabelas entram nos próximos passos.

/** Cria as tabelas (idempotente) e semeia o catálogo. */
function migrate(db) {
  db.exec(`
    create table if not exists print_specs (
      id              integer primary key autoincrement,
      shape           text    not null default 'round',
      visible_mm      real    not null,
      art_diameter_mm real    not null,
      bleed_mm        real    not null,
      safe_mm         real    not null default 2,
      dpi_target      integer not null default 300,
      is_active       integer not null default 1,
      created_at      text    not null default (datetime('now')),
      unique (shape, visible_mm),
      check (art_diameter_mm > visible_mm),
      check (visible_mm - 2 * safe_mm > 0),
      check (dpi_target > 0)
    );
  `);
  seedPrintSpecs(db);
}

/** Semeia os 3 tamanhos do MVP (idempotente). Mesmos valores da migration Postgres. */
function seedPrintSpecs(db) {
  const stmt = db.prepare(
    `insert or ignore into print_specs
       (shape, visible_mm, art_diameter_mm, bleed_mm, safe_mm, dpi_target)
     values (?, ?, ?, ?, ?, ?)`,
  );
  const rows = [
    ['round', 32, 44, 6, 2, 300],
    ['round', 44, 54, 5, 2, 300],
    ['round', 58, 70, 6, 2, 300],
  ];
  for (const r of rows) {
    stmt.run(...r);
  }
}

/** Lista os tamanhos ativos (ordenados pelo diâmetro visível). */
function listPrintSpecs(db) {
  return db.prepare('select * from print_specs where is_active = 1 order by visible_mm').all();
}

module.exports = { migrate, seedPrintSpecs, listPrintSpecs };
