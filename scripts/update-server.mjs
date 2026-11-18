#!/usr/bin/env node
/**
 * Mini-servidor LOCAL (127.0.0.1:4299) que grava o flag `scripts/.do-update`.
 * O navegador não grava arquivo; o front faz:
 *
 *   POST http://localhost:4299/do-update
 *   Content-Type: application/json   (corpo opcional) {"targetVersion":"1.2.0"}
 *   -> 200 {"ok":true}
 *
 * Só esta rota; caminho do arquivo FIXO (nada vem do cliente); CORS só p/
 * origens localhost/127.0.0.1; corpo limitado a 2KB. Iniciado pelo up.mjs em
 * processo filho (o spawnSync do up bloquearia um servidor no mesmo processo).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const UPDATE_PORT = 4299;
const HERE = dirname(fileURLToPath(import.meta.url));
const FLAG = join(process.env.SB_ROOT ? join(process.env.SB_ROOT, 'scripts') : HERE, '.do-update');
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function parseTarget(body) {
  try {
    const v = JSON.parse(body || '{}').targetVersion;
    return typeof v === 'string' && /^\d+(\.\d+){0,3}$/.test(v) ? v : null;
  } catch {
    return null; // corpo inválido: grava o flag mesmo assim, sem versão
  }
}

function writeFlag(body, res) {
  try {
    mkdirSync(dirname(FLAG), { recursive: true });
    writeFileSync(FLAG, JSON.stringify({ targetVersion: parseTarget(body), requestedAt: new Date().toISOString() }));
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
  } catch {
    res.writeHead(500).end();
  }
}

function setCors(req, res) {
  const origin = req.headers.origin;
  const allowed = typeof origin === 'string' && LOCAL_ORIGIN.test(origin);
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  return { allowed, hasOrigin: origin !== undefined };
}

export function createUpdateServer() {
  return createServer((req, res) => {
    const { allowed, hasOrigin } = setCors(req, res);
    if ((req.url ?? '').split('?')[0] !== '/do-update') {
      res.writeHead(404).end();
    } else if (hasOrigin && !allowed) {
      res.writeHead(403).end();
    } else if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
    } else if (req.method !== 'POST') {
      res.writeHead(405).end();
    } else {
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 2048) {
          req.destroy();
        }
      });
      req.on('end', () => writeFlag(body, res));
    }
  });
}

/** Sobe o servidor; EADDRINUSE (outra instância) encerra em silêncio. */
export function startUpdateServer(port = Number(process.env.SB_UPDATE_PORT) || UPDATE_PORT) {
  const server = createUpdateServer();
  server.on('error', () => process.exit(0));
  server.listen(port, '127.0.0.1');
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  startUpdateServer();
}
