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

/** Extensão a partir do mime. */
function extOf(mime) {
  if (mime === 'image/webp') {
    return '.webp';
  }
  return mime === 'image/jpeg' ? '.jpg' : '.png';
}

/** Mapeia a linha de mockup do SQLite p/ o renderer (target: TEXT -> objeto). */
function mapMockup(row) {
  if (!row) {
    return row;
  }
  let target = null;
  try {
    target = JSON.parse(row.target);
  } catch {
    target = null;
  }
  return { ...row, target };
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

  // mockup_templates (templates de cenário)
  listMockups: () => schema.listMockups(open()).map(mapMockup),
  saveMockup: ({ name, bytes, mime, sceneWidth, sceneHeight, target }) => {
    const storagePath = storage.save(bytes, extOf(mime));
    return mapMockup(
      schema.insertMockup(open(), {
        id: randomUUID(),
        name,
        storagePath,
        mime,
        bytes: bytes?.byteLength ?? bytes?.length ?? null,
        sceneWidth,
        sceneHeight,
        target: JSON.stringify(target),
      }),
    );
  },
  updateMockup: (id, { target, scene }) => {
    if (scene) {
      const old = schema.getMockup(open(), id);
      const storagePath = storage.save(scene.bytes, extOf(scene.mime));
      const row = schema.updateMockupScene(open(), id, {
        storagePath,
        mime: scene.mime,
        bytes: scene.bytes?.byteLength ?? scene.bytes?.length ?? null,
        sceneWidth: scene.width,
        sceneHeight: scene.height,
        target: JSON.stringify(target),
      });
      if (old && old.storage_path) {
        storage.remove(old.storage_path);
      }
      return mapMockup(row);
    }
    return mapMockup(schema.updateMockupTarget(open(), id, JSON.stringify(target)));
  },
  removeMockup: (id) => {
    const storagePath = schema.deleteMockup(open(), id);
    if (storagePath) {
      storage.remove(storagePath);
    }
  },

  // frame_templates (molduras + camadas)
  listFrames: () => schema.listFrames(open()),
  saveFrame: ({ name, bytes, mime, width, height }) => {
    const storagePath = storage.save(bytes, extOf(mime));
    return schema.insertFrame(open(), {
      id: randomUUID(),
      name,
      storagePath,
      mime,
      bytes: bytes?.byteLength ?? bytes?.length ?? null,
      width,
      height,
    });
  },
  updateFraming: (id, framing) => schema.updateFrameFraming(open(), id, framing),
  listLayers: (templateId) => schema.listLayers(open(), templateId),
  saveComposition: ({ templateId, layers, flatBytes }) => {
    const oldPaths = schema.frameCurrentPaths(open(), templateId);
    const flatPath = storage.save(flatBytes, '.png');
    schema.replaceLayers(open(), templateId, layers);
    const row = schema.updateFrameFlat(open(), templateId, {
      storagePath: flatPath,
      isComposite: layers.length > 1,
    });
    const keep = new Set([flatPath, ...layers.map((l) => l.storagePath)]);
    for (const p of new Set(oldPaths)) {
      if (!keep.has(p)) {
        storage.remove(p);
      }
    }
    return row;
  },
  copyPng: (srcName) => storage.copy(srcName),
  removeFrame: (id) => {
    const { storagePath, layerPaths } = schema.deleteFrame(open(), id);
    for (const p of new Set([storagePath, ...layerPaths].filter(Boolean))) {
      storage.remove(p);
    }
  },

  // leitura de mídia (bytes -> o renderer monta um blob URL p/ exibir)
  readMedia: (name) => storage.read(name),
};
