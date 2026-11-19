// Backend local (ADR-033) — armazenamento de IMAGENS em arquivos locais, no lugar
// do Supabase Storage. Os binários ficam em `userData/media` (pasta do app, no PC
// do usuário). Testável sem Electron: defina SB_MEDIA_DIR para apontar a pasta.
const { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } = require('node:fs');
const { join, basename } = require('node:path');
const { randomUUID } = require('node:crypto');

/** Pasta base das mídias (userData/media), ou SB_MEDIA_DIR em teste. */
function baseDir() {
  if (process.env.SB_MEDIA_DIR) {
    return process.env.SB_MEDIA_DIR;
  }
  const { app } = require('electron'); // require tardio: só no app real
  return join(app.getPath('userData'), 'media');
}

/** Garante a pasta e devolve o caminho absoluto de um nome seguro. */
function pathOf(name) {
  const dir = baseDir();
  mkdirSync(dir, { recursive: true });
  return join(dir, safeName(name));
}

/** Só o basename, sem `..` nem separadores — impede path traversal. */
function safeName(name) {
  return basename(String(name)).replace(/\.\.+/g, '.');
}

/** Salva os bytes (Uint8Array/Buffer) e devolve o NOME gerado (relativo). */
function save(bytes, ext = '') {
  const clean = ext && ext.startsWith('.') ? ext : ext ? `.${ext}` : '';
  const name = `${randomUUID()}${clean}`;
  writeFileSync(pathOf(name), Buffer.from(bytes));
  return name;
}

/** Lê os bytes de um arquivo salvo (Buffer) ou `null` se não existir. */
function read(name) {
  const p = pathOf(name);
  return existsSync(p) ? readFileSync(p) : null;
}

/** Remove o arquivo (idempotente). */
function remove(name) {
  try {
    rmSync(pathOf(name));
  } catch {
    /* já não existia */
  }
}

/** `true` se o arquivo existe. */
function has(name) {
  return existsSync(pathOf(name));
}

module.exports = { save, read, remove, has, safeName };
