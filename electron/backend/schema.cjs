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

    create table if not exists background_templates (
      id           text    primary key,
      name         text    not null,
      storage_path text    not null,
      mime         text    not null check (mime in ('image/png', 'image/jpeg')),
      bytes        integer,
      width_px     integer,
      height_px    integer,
      created_at   text    not null default (datetime('now'))
    );
    create index if not exists background_templates_created_at_idx
      on background_templates (created_at desc);
  `);
  seedPrintSpecs(db);
}

// ── background_templates (biblioteca de fundos — ADR-016) ────────────────────

/** Lista os templates de fundo (mais recentes primeiro). */
function listBackgrounds(db) {
  return db
    .prepare(
      `select id, name, storage_path, mime, bytes, width_px, height_px, created_at
         from background_templates order by created_at desc`,
    )
    .all();
}

/** Insere um template e devolve a linha criada. `id` é um UUID. */
function insertBackground(db, { id, name, storagePath, mime, bytes, width, height }) {
  db.prepare(
    `insert into background_templates
       (id, name, storage_path, mime, bytes, width_px, height_px)
     values (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name, storagePath, mime, bytes ?? null, width ?? null, height ?? null);
  return db
    .prepare(
      `select id, name, storage_path, mime, bytes, width_px, height_px, created_at
         from background_templates where id = ?`,
    )
    .get(id);
}

/** Remove o template pela id. Devolve o storage_path (p/ apagar o arquivo). */
function deleteBackground(db, id) {
  const row = db.prepare('select storage_path from background_templates where id = ?').get(id);
  db.prepare('delete from background_templates where id = ?').run(id);
  return row ? row.storage_path : null;
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

module.exports = {
  migrate,
  seedPrintSpecs,
  listPrintSpecs,
  listBackgrounds,
  insertBackground,
  deleteBackground,
};
