// Sobe o Star Bottons 100% com UM comando: `npm run up`.
//
// Faz, em ordem, o que antes era manual a cada reinício da máquina:
//   1) garante o Docker Desktop no ar (inicia e espera o engine);
//   2) sobe a stack Supabase local (`supabase start`, idempotente);
//   3) ressincroniza o relógio da VM (evita "JWT issued at future" no login/upload);
//   4) sobe edge + web (`npm run dev`), com auto-restart do edge (que às vezes
//      cai com "unexpected EOF") sem derrubar a web.
//
// `npm start` (ng serve) sobe SÓ o front — por isso este comando existe.
import { execSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const isWin = process.platform === 'win32';

/** Dorme `ms` de forma síncrona, sem dependências. */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Roda mostrando a saída; lança se o comando falhar. */
function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

/** `true` se o comando sair com código 0 (saída suprimida). */
function ok(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function step(msg) {
  console.log(`\n\u001b[36m▶ ${msg}\u001b[0m`);
}

/** `true` se já há algo ESCUTANDO na porta TCP (Windows). */
function portInUse(port) {
  if (!isWin) {
    return false;
  }
  return ok(
    `powershell -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"`,
  );
}

/** Primeira porta livre a partir de 4200 — evita colidir com outro ng serve. */
function pickWebPort() {
  for (let p = 4200; p <= 4210; p++) {
    if (!portInUse(p)) {
      return p;
    }
  }
  return 4200; // desiste; o ng serve avisa se estiver ocupada
}

// ── 1) Docker engine ────────────────────────────────────────────────────────
step('1/4  Docker');
if (ok('docker info')) {
  console.log('      engine ja esta pronto.');
} else if (!isWin) {
  console.error('      Docker offline. Inicie o Docker e rode `npm run up` de novo.');
  process.exit(1);
} else {
  console.log('      engine offline — iniciando o Docker Desktop...');
  const candidates = [
    `${process.env.ProgramFiles}\\Docker\\Docker\\Docker Desktop.exe`,
    `${process.env.LOCALAPPDATA}\\Docker\\Docker Desktop.exe`,
  ];
  const exe = candidates.find((p) => p && existsSync(p));
  if (exe) {
    try {
      execSync(`powershell -NoProfile -Command "Start-Process '${exe}'"`, { stdio: 'ignore' });
    } catch {
      console.error('      nao consegui iniciar o Docker Desktop — abra-o manualmente.');
    }
  } else {
    console.error('      Docker Desktop.exe nao encontrado — abra-o manualmente.');
  }
  const deadline = Date.now() + 210_000; // ~3,5 min
  process.stdout.write('      aguardando o engine');
  while (!ok('docker info')) {
    if (Date.now() > deadline) {
      console.error('\n      Docker nao ficou pronto a tempo. Abra o Docker Desktop e rode `npm run up` de novo.');
      process.exit(1);
    }
    process.stdout.write('.');
    sleep(5000);
  }
  console.log(' pronto.');
}

// ── 2) Supabase local (idempotente + tolerante ao timing) ───────────────────
// Logo após o Docker subir, os containers do Supabase (que reiniciam junto com o
// engine) podem ainda estar em "starting" — e `supabase start` sai com erro
// ("container is not ready: starting"). Em vez de abortar, esperamos a stack
// ficar realmente pronta, re-tentando start/status com timeout.
step('2/4  Supabase local');
if (ok('supabase start')) {
  console.log('      stack pronta.');
} else {
  // Re-tenta o PRÓPRIO `supabase start` (não `status`, que pode sair 0 com
  // serviços ainda parados) até subir tudo ou estourar o timeout.
  process.stdout.write('      containers ainda subindo — aguardando');
  const sbDeadline = Date.now() + 180_000; // 3 min
  let started = false;
  while (!started) {
    if (Date.now() > sbDeadline) {
      console.error('\n      Supabase nao ficou pronto a tempo. Rode `supabase start --debug`.');
      process.exit(1);
    }
    sleep(5000);
    process.stdout.write('.');
    started = ok('supabase start');
  }
  console.log(' pronto.');
}

// ── 3) Relogio da VM (evita "JWT issued at future") ─────────────────────────
step('3/4  Relogio da VM');
try {
  run('npm run fix:clock');
} catch {
  console.warn('      fix:clock falhou — siga mesmo assim; se o login der "JWT issued at future", rode `npm run fix:clock`.');
}

// ── 4) Edge + Web (auto-restart do edge; Ctrl+C encerra os dois) ────────────
step('4/4  Edge + Web  (Ctrl+C encerra)');
// Escolhe a porta do front: prefere a 4200, mas se outro sistema (ex.: Controle
// Fitness/Nexgency, que também usam ng serve) já a ocupa, usa a próxima livre —
// senão o ng serve entra em loop de falha e o atalho abriria o app ERRADO.
const port = pickWebPort();
if (port === 4200) {
  console.log('      web na porta 4200.');
} else {
  console.log(`      porta 4200 OCUPADA por outro sistema — usando a ${port}.`);
}
// Endpoint local do auto-update (POST http://localhost:4299/do-update grava o flag
// scripts/.do-update). Processo filho p/ rodar em paralelo ao spawnSync abaixo;
// falha/porta ocupada nunca impede o app de subir.
try {
  const updater = spawn(process.execPath, [fileURLToPath(new URL('./update-server.mjs', import.meta.url))], {
    stdio: 'ignore',
    windowsHide: true,
  });
  updater.on('error', () => {});
  updater.unref();
  process.on('exit', () => updater.kill());
} catch {
  /* não-crítico */
}
// Grava a porta p/ o atalho (start-app.ps1) abrir o Chrome na porta CERTA.
try {
  writeFileSync(new URL('./.web-port', import.meta.url), String(port));
} catch {
  /* não-crítico: o atalho cai no fallback 4200 */
}
// `shell: true` e OBRIGATORIO no Windows: desde o patch da CVE-2024-27980 o Node
// recusa executar `.cmd` (npm.cmd/npx.cmd) sem shell e o spawn falha em silencio.
// Chamamos o concurrently direto p/ injetar `--port` no `ng serve` (o `npm run
// dev` fica como atalho manual na 4200 padrão).
const devCmd =
  'npx concurrently -n edge,web -c magenta,cyan --restart-tries 1000 ' +
  `--restart-after 2000 "npm:edge" "ng serve --port ${port}"`;
const res = spawnSync(devCmd, { stdio: 'inherit', shell: true });
if (res.error) {
  console.error('      Falha ao subir edge+web:', res.error.message);
  process.exit(1);
}
process.exit(res.status ?? 0);
