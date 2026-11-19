// Star Bottons — abre o app desktop (Electron) com UM comando:  npm run desktop
//
// APÓS a migração local (ADR-033/034) o app NÃO precisa mais de Supabase/edge/
// Docker — tudo roda em processo (SQLite + arquivos). Então este startup é
// ENXUTO: sobe SÓ o `ng serve` (web) e abre o Electron NA HORA. A janela já
// aparece com a tela de carregamento (electron/loading.html) e troca pela app
// assim que o front responder — sem esperar Docker/Supabase subirem.
//
// (Para desenvolver com a stack completa — edge/Supabase —, use `npm run up`.)
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { Socket } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJ = join(HERE, '..');
const PORT_FILE = join(HERE, '.web-port');
const MAIN = join(PROJ, 'electron', 'main.cjs');

/**
 * true se ALGUÉM já escuta em host:port (connect bem-sucedido).
 * GOTCHA: `createServer().listen(port)` faz bind no CURINGA e NÃO detecta um
 * `ng serve` de outro projeto (ex.: Controle Fitness) que, no Windows, escuta
 * SÓ em `::1` (loopback IPv6). Isso fazia a 4200 parecer livre, o nosso ng serve
 * colidir e a janela do Electron carregar o APP ERRADO. Sondar por connect em
 * 127.0.0.1 E ::1 pega o bind loopback-only.
 */
function inUse(host, port) {
  return new Promise((resolve) => {
    const sock = new Socket();
    const done = (v) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(600);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false)); // ECONNREFUSED = ninguém escutando
    sock.connect(port, host);
  });
}

/** Porta LIVRE = ninguém escutando em 127.0.0.1 NEM em ::1. */
async function portFree(port) {
  const [v4, v6] = await Promise.all([inUse('127.0.0.1', port), inUse('::1', port)]);
  return !v4 && !v6;
}

/** 1ª porta livre a partir de 4200 — evita colidir com outro ng serve (ex.: CF). */
async function pickPort() {
  for (let p = 4200; p <= 4210; p++) {
    if (await portFree(p)) {
      return p;
    }
  }
  return 4200; // desiste; o ng serve avisa se estiver ocupada
}

async function main() {
  try {
    rmSync(PORT_FILE);
  } catch {
    /* já não existia */
  }

  const port = await pickPort();
  // Grava a porta p/ o main.cjs/atalho abrirem na porta CERTA.
  try {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(PORT_FILE, String(port));
  } catch {
    /* não-crítico: fallback 4200 */
  }

  // Endpoint local do auto-update (POST localhost:4299/do-update). Opcional;
  // falha/porta ocupada nunca impede o app de subir.
  let updater = null;
  try {
    updater = spawn(process.execPath, [join(HERE, 'update-server.mjs')], {
      stdio: 'ignore',
      windowsHide: true,
    });
    updater.on('error', () => {});
  } catch {
    /* não-crítico */
  }

  // Sobe SÓ o front (ng serve na porta escolhida). shell:true é obrigatório no
  // Windows (Node recusa .cmd sem shell desde a CVE-2024-27980).
  const web = spawn(`npx ng serve --port ${port}`, {
    cwd: PROJ,
    stdio: 'inherit',
    shell: true,
  });

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    // Mata a ÁRVORE do ng serve (senão sobrevive e o console fica aberto).
    try {
      if (process.platform === 'win32' && web.pid) {
        spawnSync('taskkill', ['/PID', String(web.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        web.kill('SIGKILL');
      }
    } catch {
      /* ignore */
    }
    try {
      updater?.kill();
    } catch {
      /* ignore */
    }
  };
  process.on('exit', cleanup);

  // Abre o Electron IMEDIATAMENTE: a janela mostra a tela de carregamento e o
  // próprio main.cjs sonda a porta e troca pela app quando o ng serve responde.
  const require = createRequire(import.meta.url);
  const electronBin = require('electron'); // caminho do binário do Electron
  const win = spawn(electronBin, [MAIN], {
    cwd: PROJ,
    stdio: 'inherit',
    env: { ...process.env, SB_APP_URL: `http://localhost:${port}` },
  });
  win.on('exit', () => {
    cleanup();
    process.exit(0);
  });
}

main();
