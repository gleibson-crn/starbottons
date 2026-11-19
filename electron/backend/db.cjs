// Backend local (ADR-033) — abre o SQLite no userData do app e orquestra as
// operações (banco + arquivos) que o renderer consome via IPC.
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { join } = require('node:path');
const schema = require('./schema.cjs');
const storage = require('./storage.cjs');
const { renderArtwork, frameOpts } = require('./generate/render.cjs');
const { assertSafeSource } = require('./generate/image-header.cjs');
const { ArtError } = require('./generate/art-error.cjs');

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

// ── geração local (ADR-034 F4) — I/O + chamada à computação pura ─────────────

/**
 * Carrega o FUNDO (path no storage local) com fallback gracioso: qualquer falha
 * (inexistente/validação/teto de MP) retorna null → a composição cai só na cor.
 */
function loadBackgroundBytes(path) {
  if (!path) {
    return null;
  }
  try {
    const bytes = storage.read(path);
    if (!bytes) {
      return null;
    }
    assertSafeSource(bytes); // magic bytes + teto de MP
    return bytes;
  } catch (err) {
    console.error('[generate] fundo indisponível, usando cor:', err?.message ?? err);
    return null;
  }
}

/**
 * Carrega as molduras (ordem = z-order) do storage local. Cada uma EXIGE PNG
 * (alfa) — JPEG opaco taparia o botton. Inválida/ausente é PULADA (gracioso).
 */
function loadFrameLayers(frames) {
  const layers = [];
  for (const frame of frames ?? []) {
    try {
      const bytes = storage.read(frame.path);
      if (!bytes) {
        continue;
      }
      const info = assertSafeSource(bytes);
      if (info.mime !== 'image/png') {
        throw new ArtError(400, 'moldura precisa ser PNG (com alfa)');
      }
      layers.push({ bytes, opts: frameOpts(frame) });
    } catch (err) {
      console.error('[generate] moldura indisponível, ignorando:', err?.message ?? err);
    }
  }
  return layers;
}

module.exports = {
  open,

  // print_specs (catálogo; também usado pela geração)
  listPrintSpecs: () => schema.listPrintSpecs(open()),

  // uploads (originais enviados — ADR-034 F1)
  saveUpload: ({ bytes, filename, mime, width, height }) => {
    const storagePath = storage.save(bytes, extOf(mime));
    const row = schema.insertUpload(open(), {
      id: randomUUID(),
      storagePath,
      filename,
      mime,
      width,
      height,
      bytes: bytes?.byteLength ?? bytes?.length ?? null,
    });
    // Contrato do UploadRecord no renderer: { id, path }.
    return { id: row.id, path: row.storage_path };
  },

  // geração (ADR-034 F4): body = GenerateRequest (com job_id). Síncrono: sem
  // generation_jobs/polling (roda em processo). Devolve o caminho do print_png
  // (o renderer monta o blob URL via media.read) + dimensões/DPI.
  generate: ({ job_id, upload_id, shape_key, size_mm, options }) => {
    const spec = schema.getPrintSpec(open(), shape_key ?? 'round', size_mm);
    if (!spec) {
      throw new ArtError(422, `sem print_spec para ${shape_key} ${size_mm}mm`);
    }
    const sourcePath = schema.getUploadPath(open(), upload_id);
    const source = sourcePath ? storage.read(sourcePath) : null;
    if (!source) {
      throw new ArtError(404, 'arquivo de origem não encontrado');
    }
    const opts = options ?? {};
    const background = loadBackgroundBytes(opts.backgroundImage);
    const frames = loadFrameLayers(opts.frames);
    return renderArtwork(spec, opts, source, background, frames).then((art) => {
      const path = storage.save(art.bytes, '.png');
      schema.upsertRender(open(), {
        jobId: job_id,
        storagePath: path,
        widthPx: art.width_px,
        heightPx: art.height_px,
        dpi: art.dpi,
      });
      return { path, width_px: art.width_px, height_px: art.height_px, dpi: art.dpi };
    });
  },

  /** Caminho do render de um job (freshPrintUrl após recarregar o lote). */
  renderPath: (jobId) => schema.getRenderPath(open(), jobId),

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
