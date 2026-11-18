// Setup guiado do Star Bottons numa maquina nova: `npm run setup`.
//
// Em ordem (idempotente — pode rodar de novo sem refazer trabalho pesado):
//   1) confere pre-requisitos (Node, Docker Desktop + engine, Supabase CLI);
//   2) npm install;
//   3) supabase start (tolera "ja rodando");
//   4) supabase db reset (migrations + seed + usuario de teste) — DESTRUTIVO:
//      se ja houver dados locais, pede confirmacao (use --yes p/ pular o prompt);
//   5) models:fetch (modelo do "Remover fundo" ~86MB; so baixa se faltar/divergir);
//   6) cria o atalho "Star Bottons" na area de trabalho (Windows).
//
// NAO instala Node nem Docker: se faltar, avisa como instalar e para.
import { execSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const isWin = process.platform === 'win32';
const autoYes = process.argv.includes('--yes') || process.argv.includes('-y');
const PROJECT_ID = 'starbottons';
const MIN_NODE_MAJOR = 22;
const pending = []; // o que ficou faltando, p/ o resumo final

/** Roda mostrando a saida; lanca se o comando falhar. */
function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

/** `true` se o comando sair com codigo 0 (saida suprimida). */
function ok(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Saida (stdout) do comando, ou `null` se falhar. */
function out(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function step(msg) {
  console.log(`\n\u001b[36m▶ ${msg}\u001b[0m`);
}

function stopWith(lines) {
  console.error('\n\u001b[31m✖ Setup interrompido — falta um pre-requisito:\u001b[0m');
  for (const l of lines) {
    console.error(`  ${l}`);
  }
  console.error('\n  Instale o que falta e rode `npm run setup` de novo.');
  process.exit(1);
}

// ── 1) Pre-requisitos ───────────────────────────────────────────────────────
step('1/6  Pre-requisitos');
const missing = [];

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor >= MIN_NODE_MAJOR) {
  console.log(`      Node ${process.versions.node} ok.`);
} else {
  missing.push(
    `Node ${process.versions.node} e antigo (precisa >= ${MIN_NODE_MAJOR}). Instale o Node LTS: https://nodejs.org (ou \`winget install OpenJS.NodeJS.LTS\`).`,
  );
}

const dockerVer = out('docker --version');
if (!dockerVer) {
  missing.push(
    'Docker Desktop nao encontrado. Instale: https://www.docker.com/products/docker-desktop (ou `winget install Docker.DockerDesktop`), abra-o e espere o engine ficar pronto.',
  );
} else if (!ok('docker info')) {
  missing.push(
    `Docker instalado (${dockerVer}), mas o engine esta OFFLINE. Abra o Docker Desktop, espere ficar "Engine running" e rode de novo.`,
  );
} else {
  console.log(`      ${dockerVer} — engine ativo.`);
}

const sbVer = out('supabase --version');
if (!sbVer) {
  missing.push(
    'Supabase CLI nao encontrado. Instale: `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git && scoop install supabase` (ou `npm i -g supabase`; veja https://supabase.com/docs/guides/local-development/cli/getting-started).',
  );
} else {
  console.log(`      Supabase CLI ${sbVer} ok.`);
}

if (missing.length > 0) {
  stopWith(missing.map((m) => `- ${m}`));
}

// ── 2) npm install ──────────────────────────────────────────────────────────
step('2/6  npm install');
run('npm install');

// ── 3) Supabase start ───────────────────────────────────────────────────────
step('3/6  Supabase local (supabase start)');
try {
  run('supabase start');
} catch {
  console.error('      `supabase start` falhou. Rode `supabase start --debug` p/ detalhes e tente de novo.');
  process.exit(1);
}

// ── 4) db reset (destrutivo: confirma se ja houver dados) ───────────────────
step('4/6  Banco local (db reset: migrations + seed + usuario de teste)');
const dbContainer = `supabase_db_${PROJECT_ID}`;
const countRaw = out(
  `docker exec ${dbContainer} psql -U postgres -tA -c "select count(*) from auth.users"`,
);
const userCount = countRaw === null ? null : Number(countRaw);
// Sem leitura = banco ainda sem schema auth populado/inacessivel: trata como vazio.
const hasData = Number.isFinite(userCount) && userCount > 0;

let doReset = true;
if (hasData) {
  console.log(
    `      ATENCAO: o banco local ja tem dados (${userCount} usuario(s)). \`db reset\` APAGA todos os dados locais e recria do zero.`,
  );
  if (autoYes) {
    console.log('      --yes informado: prosseguindo.');
  } else if (!process.stdin.isTTY) {
    console.log('      Sem terminal interativo: db reset PULADO (use `npm run setup -- --yes` p/ forcar).');
    pending.push('db reset pulado (banco ja tinha dados) — rode `npm run db:reset` se quiser recriar.');
    doReset = false;
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ans = (await rl.question('      Apagar e recriar o banco local? [s/N] ')).trim().toLowerCase();
    rl.close();
    doReset = ans === 's' || ans === 'sim' || ans === 'y' || ans === 'yes';
    if (!doReset) {
      console.log('      Mantendo os dados existentes (db reset pulado).');
    }
  }
} else {
  console.log('      Banco vazio (maquina nova) — rodando db reset direto.');
}
if (doReset) {
  try {
    run('supabase db reset');
  } catch {
    console.error('      `supabase db reset` falhou. Rode `npm run db:reset` e veja o erro.');
    process.exit(1);
  }
}

// ── 5) Modelo do "Remover fundo" ────────────────────────────────────────────
step('5/6  Modelo do "Remover fundo" (models:fetch)');
// fetch-models.mjs ja e idempotente: confere o SHA-256 e so baixa se faltar.
try {
  run('node scripts/fetch-models.mjs');
} catch {
  console.warn('      models:fetch falhou — o app funciona, mas "Remover fundo" nao. Rode `npm run models:fetch` depois.');
  pending.push('modelo do "Remover fundo" nao baixado — rode `npm run models:fetch`.');
}

// ── 6) Atalho na area de trabalho ───────────────────────────────────────────
step('6/6  Atalho "Star Bottons" na area de trabalho');
if (!isWin) {
  console.log('      Nao-Windows: atalho pulado. Use `npm run up`.');
  pending.push('atalho nao criado (so Windows) — use `npm run up`.');
} else {
  const res = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/create-desktop-shortcut.ps1'],
    { stdio: 'inherit' },
  );
  if (res.status !== 0) {
    console.warn('      Falha ao criar o atalho — rode `scripts\\create-desktop-shortcut.ps1` manualmente.');
    pending.push('atalho nao criado — rode `powershell -ExecutionPolicy Bypass -File scripts\\create-desktop-shortcut.ps1`.');
  }
}

// ── Resumo ──────────────────────────────────────────────────────────────────
console.log('');
if (pending.length === 0) {
  console.log('\u001b[32m✔ Pronto! De 2 cliques em "Star Bottons" na area de trabalho.\u001b[0m');
  console.log('  (ou rode `npm run up` no terminal)');
} else {
  console.log('\u001b[33m⚠ Setup concluido, com pendencias:\u001b[0m');
  for (const p of pending) {
    console.log(`  - ${p}`);
  }
  console.log('  Depois disso: de 2 cliques em "Star Bottons" (ou `npm run up`).');
}
