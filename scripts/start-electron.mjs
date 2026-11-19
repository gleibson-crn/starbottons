// Star Bottons — Fase 0 (ADR-032): abre o app desktop (Electron) com UM comando.
//
//   npm run desktop
//
// Orquestra na ordem certa (resolve o conflito de porta com outros projetos
// Angular do dono, ex.: Controle Fitness na 4200):
//   1) limpa a porta antiga (scripts/.web-port) p/ não ler valor stale;
//   2) sobe o backend+web (up.mjs), que ESCOLHE a 1ª porta livre e grava a nova;
//   3) espera o app responder NAQUELA porta (sonda IPv4 e IPv6 — ng serve escuta ::1);
//   4) abre o Electron apontando para a porta CERTA (SB_APP_URL);
//   5) ao fechar a janela, derruba o backend.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJ = join(HERE, '..');
const PORT_FILE = join(HERE, '.web-port');
const MAIN = join(PROJ, 'electron', 'main.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** true se host:port responde GET / (<400). */
function probe(host, port) {
  return new Promise((resolve) => {
    const req = httpGet({ host, port, path: '/', timeout: 1500 }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/** Sonda IPv4 e IPv6 (o ng serve no Windows costuma escutar só em ::1). */
async function appReady(port) {
  const [v4, v6] = await Promise.all([probe('127.0.0.1', port), probe('::1', port)]);
  return v4 || v6;
}

async function main() {
  try {
    rmSync(PORT_FILE);
  } catch {
    /* já não existia */
  }

  // Sobe o stack (up.mjs grava a porta escolhida em scripts/.web-port).
  const up = spawn('npm', ['run', 'up'], { cwd: PROJ, stdio: 'inherit', shell: true });
  const killUp = () => {
    try {
      up.kill();
    } catch {
      /* ignore */
    }
  };
  process.on('exit', killUp);

  // Espera a porta ser gravada E o app responder nela.
  let port = null;
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    if (existsSync(PORT_FILE)) {
      const p = readFileSync(PORT_FILE, 'utf8').trim();
      if (/^\d+$/.test(p) && (await appReady(Number(p)))) {
        port = p;
        break;
      }
    }
    await sleep(1500);
  }
  if (!port) {
    console.error('Star Bottons não subiu a tempo. Confira o log acima (npm run up).');
    killUp();
    process.exit(1);
  }

  // Abre o Electron apontando para a porta CERTA.
  const require = createRequire(import.meta.url);
  const electronBin = require('electron'); // caminho do binário do Electron
  const win = spawn(electronBin, [MAIN], {
    cwd: PROJ,
    stdio: 'inherit',
    env: { ...process.env, SB_APP_URL: `http://localhost:${port}` },
  });
  win.on('exit', () => {
    killUp();
    process.exit(0);
  });
}

main();
