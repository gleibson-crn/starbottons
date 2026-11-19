// Backend local (ADR-033) — schema + queries PUROS, sobre node:sqlite.
//
// Separado do Electron de propósito: recebe uma instância de DatabaseSync e não
// importa 'electron', para poder ser testado com node:sqlite diretamente.
// O `db.cjs` embrulha isto com o caminho do arquivo no userData do app.
//
// Esta é a FUNDAÇÃO da migração: começa pela tabela print_specs (catálogo de
// tamanhos, só leitura). As demais tabelas entram nos próximos passos.

const { randomUUID } = require('node:crypto');

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

    create table if not exists mockup_templates (
      id              text    primary key,
      name            text    not null,
      storage_path    text    not null,
      mime            text    not null check (mime in ('image/webp', 'image/jpeg', 'image/png')),
      bytes           integer,
      scene_width_px  integer,
      scene_height_px integer,
      target          text    not null,  -- JSON {cx,cy,r,rotation} (normalizado 0..1)
      created_at      text    not null default (datetime('now'))
    );
    create index if not exists mockup_templates_created_at_idx
      on mockup_templates (created_at desc);

    create table if not exists frame_templates (
      id               text    primary key,
      name             text    not null,
      storage_path     text    not null,
      mime             text    not null check (mime = 'image/png'),
      bytes            integer,
      width_px         integer,
      height_px        integer,
      default_offset_x real    not null default 0,
      default_offset_y real    not null default 0,
      default_scale    real    not null default 1,
      default_rotation real    not null default 0,
      is_composite     integer not null default 0,
      created_at       text    not null default (datetime('now'))
    );
    create index if not exists frame_templates_created_at_idx
      on frame_templates (created_at desc);

    create table if not exists frame_template_layers (
      id                 text    primary key,
      template_id        text    not null,
      position           integer not null,
      storage_path       text    not null,
      offset_x           real    not null default 0,
      offset_y           real    not null default 0,
      scale              real    not null default 1,
      rotation           real    not null default 0,
      source             text    not null default 'upload' check (source in ('upload', 'template')),
      origin_template_id text,
      unique (template_id, position)
    );

    -- Originais enviados (ADR-034 F1): no lugar do bucket 'uploads' do Supabase.
    create table if not exists uploads (
      id           text    primary key,
      storage_path text    not null,
      filename     text,
      mime         text,
      width_px     integer,
      height_px    integer,
      bytes        integer,
      created_at   text    not null default (datetime('now'))
    );

    -- Artes de impressão geradas (ADR-034 F4): no lugar do bucket 'renders'.
    -- Chaveado por job_id (UUID do client) p/ o freshPrintUrl reconstruir a URL
    -- após recarregar o lote (o snapshot não persiste a URL — só o jobId).
    create table if not exists renders (
      job_id       text    primary key,
      storage_path text    not null,
      width_px     integer,
      height_px    integer,
      dpi          integer,
      created_at   text    not null default (datetime('now'))
    );
  `);
  seedPrintSpecs(db);
}

// ── uploads (originais enviados — ADR-034 F1) ────────────────────────────────

/** Registra um upload e devolve a linha. `id` é um UUID. */
function insertUpload(db, { id, storagePath, filename, mime, width, height, bytes }) {
  db.prepare(
    `insert into uploads (id, storage_path, filename, mime, width_px, height_px, bytes)
     values (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, storagePath, filename ?? null, mime ?? null, width ?? null, height ?? null, bytes ?? null);
  return db.prepare('select * from uploads where id = ?').get(id);
}

/** Caminho do original pelo id do upload (ou null). */
function getUploadPath(db, id) {
  const row = db.prepare('select storage_path from uploads where id = ?').get(id);
  return row ? row.storage_path : null;
}

// ── renders (artes de impressão geradas — ADR-034 F4) ────────────────────────

/** Grava (UPSERT por job_id) o render de um job e devolve a linha. */
function upsertRender(db, { jobId, storagePath, widthPx, heightPx, dpi }) {
  db.prepare(
    `insert into renders (job_id, storage_path, width_px, height_px, dpi)
       values (?, ?, ?, ?, ?)
     on conflict (job_id) do update set
       storage_path = excluded.storage_path,
       width_px = excluded.width_px,
       height_px = excluded.height_px,
       dpi = excluded.dpi`,
  ).run(jobId, storagePath, widthPx ?? null, heightPx ?? null, dpi ?? null);
  return db.prepare('select * from renders where job_id = ?').get(jobId);
}

/** Caminho do render pelo job_id (ou null) — usado pelo freshPrintUrl. */
function getRenderPath(db, jobId) {
  const row = db.prepare('select storage_path from renders where job_id = ?').get(jobId);
  return row ? row.storage_path : null;
}

// ── mockup_templates (templates de cenário — ADR-017) ───────────────────────

const MOCKUP_COLS =
  'id, name, storage_path, mime, bytes, scene_width_px, scene_height_px, target, created_at';

/** Lista os templates de cena (mais recentes primeiro). `target` vem como JSON texto. */
function listMockups(db) {
  return db.prepare(`select ${MOCKUP_COLS} from mockup_templates order by created_at desc`).all();
}

function getMockup(db, id) {
  return db.prepare(`select ${MOCKUP_COLS} from mockup_templates where id = ?`).get(id);
}

/** Insere; `target` deve chegar já como JSON string. */
function insertMockup(db, { id, name, storagePath, mime, bytes, sceneWidth, sceneHeight, target }) {
  db.prepare(
    `insert into mockup_templates
       (id, name, storage_path, mime, bytes, scene_width_px, scene_height_px, target)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name, storagePath, mime, bytes ?? null, sceneWidth ?? null, sceneHeight ?? null, target);
  return getMockup(db, id);
}

/** Atualiza só o alvo (JSON string). */
function updateMockupTarget(db, id, target) {
  db.prepare('update mockup_templates set target = ? where id = ?').run(target, id);
  return getMockup(db, id);
}

/** Troca a cena (novo arquivo + dimensões/mime) e o alvo. */
function updateMockupScene(db, id, { storagePath, mime, bytes, sceneWidth, sceneHeight, target }) {
  db.prepare(
    `update mockup_templates
        set storage_path = ?, mime = ?, bytes = ?, scene_width_px = ?, scene_height_px = ?, target = ?
      where id = ?`,
  ).run(storagePath, mime, bytes ?? null, sceneWidth ?? null, sceneHeight ?? null, target, id);
  return getMockup(db, id);
}

/** Remove e devolve o storage_path (p/ apagar o arquivo). */
function deleteMockup(db, id) {
  const row = db.prepare('select storage_path from mockup_templates where id = ?').get(id);
  db.prepare('delete from mockup_templates where id = ?').run(id);
  return row ? row.storage_path : null;
}

// ── frame_templates + frame_template_layers (molduras — ADR-023/024) ─────────

const FRAME_COLS =
  'id, name, storage_path, mime, bytes, width_px, height_px, default_offset_x, default_offset_y, default_scale, default_rotation, is_composite, created_at';
const LAYER_COLS =
  'id, template_id, position, storage_path, offset_x, offset_y, scale, rotation, source, origin_template_id';

function listFrames(db) {
  return db.prepare(`select ${FRAME_COLS} from frame_templates order by created_at desc`).all();
}

function getFrame(db, id) {
  return db.prepare(`select ${FRAME_COLS} from frame_templates where id = ?`).get(id);
}

/** Insere a moldura + a camada 0 (= o próprio PNG, neutra). */
function insertFrame(db, { id, name, storagePath, mime, bytes, width, height }) {
  db.prepare(
    `insert into frame_templates (id, name, storage_path, mime, bytes, width_px, height_px)
     values (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name, storagePath, mime, bytes ?? null, width ?? null, height ?? null);
  insertLayer(db, { templateId: id, position: 0, storagePath, source: 'upload' });
  return getFrame(db, id);
}

function updateFrameFraming(db, id, { offsetX, offsetY, scale, rotation }) {
  db.prepare(
    `update frame_templates
        set default_offset_x = ?, default_offset_y = ?, default_scale = ?, default_rotation = ?
      where id = ?`,
  ).run(offsetX, offsetY, scale, rotation, id);
  return getFrame(db, id);
}

function updateFrameFlat(db, id, { storagePath, isComposite }) {
  db.prepare('update frame_templates set storage_path = ?, is_composite = ? where id = ?').run(
    storagePath,
    isComposite ? 1 : 0,
    id,
  );
  return getFrame(db, id);
}

/** Remove a moldura (+ suas camadas) e devolve os paths dos arquivos a apagar. */
function deleteFrame(db, id) {
  const frame = db.prepare('select storage_path from frame_templates where id = ?').get(id);
  const layerPaths = db
    .prepare('select storage_path from frame_template_layers where template_id = ?')
    .all(id)
    .map((r) => r.storage_path);
  db.prepare('delete from frame_template_layers where template_id = ?').run(id);
  db.prepare('delete from frame_templates where id = ?').run(id);
  return { storagePath: frame ? frame.storage_path : null, layerPaths };
}

function listLayers(db, templateId) {
  return db
    .prepare(`select ${LAYER_COLS} from frame_template_layers where template_id = ? order by position`)
    .all(templateId);
}

function insertLayer(
  db,
  { templateId, position, storagePath, offsetX, offsetY, scale, rotation, source, originTemplateId },
) {
  db.prepare(
    `insert into frame_template_layers
       (id, template_id, position, storage_path, offset_x, offset_y, scale, rotation, source, origin_template_id)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    templateId,
    position,
    storagePath,
    offsetX ?? 0,
    offsetY ?? 0,
    scale ?? 1,
    rotation ?? 0,
    source ?? 'upload',
    originTemplateId ?? null,
  );
}

/** Substitui todas as camadas da moldura (delete + insert na ordem dada). */
function replaceLayers(db, templateId, layers) {
  db.prepare('delete from frame_template_layers where template_id = ?').run(templateId);
  layers.forEach((l, i) =>
    insertLayer(db, {
      templateId,
      position: i,
      storagePath: l.storagePath,
      offsetX: l.offset?.x,
      offsetY: l.offset?.y,
      scale: l.scale,
      rotation: l.rotation,
      source: l.source,
      originTemplateId: l.originTemplateId,
    }),
  );
}

/** Paths em uso pela moldura hoje: achatado atual + PNGs das camadas. */
function frameCurrentPaths(db, templateId) {
  const frame = db.prepare('select storage_path from frame_templates where id = ?').get(templateId);
  const layers = db
    .prepare('select storage_path from frame_template_layers where template_id = ?')
    .all(templateId)
    .map((r) => r.storage_path);
  return [frame ? frame.storage_path : null, ...layers].filter(Boolean);
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

/** Carrega a print_spec de shape×tamanho (visível) ativa, ou null (paridade com a edge). */
function getPrintSpec(db, shape, visibleMm) {
  return (
    db
      .prepare(
        'select * from print_specs where shape = ? and visible_mm = ? and is_active = 1',
      )
      .get(shape, visibleMm) ?? null
  );
}

module.exports = {
  migrate,
  seedPrintSpecs,
  listPrintSpecs,
  getPrintSpec,
  insertUpload,
  getUploadPath,
  upsertRender,
  getRenderPath,
  listBackgrounds,
  insertBackground,
  deleteBackground,
  listMockups,
  getMockup,
  insertMockup,
  updateMockupTarget,
  updateMockupScene,
  deleteMockup,
  listFrames,
  getFrame,
  insertFrame,
  updateFrameFraming,
  updateFrameFlat,
  deleteFrame,
  listLayers,
  insertLayer,
  replaceLayers,
  frameCurrentPaths,
};
