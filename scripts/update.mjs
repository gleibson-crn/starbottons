#!/usr/bin/env node
/**
 * update — canal de atualização do Star Bottons (ADR-031).
 *
 *   node scripts/update.mjs check   git fetch + compara versão com origin/main;
 *                                   escreve/apaga scripts/.update-available e
 *                                   public/update-available.json. Silencioso e
 *                                   NUNCA trava/falha (offline = "sem update").
 *   node scripts/update.mjs apply   git merge --ff-only origin/main + npm install
 *                                   + models:fetch. Aborta (sem tocar em nada) se
 *                                   a árvore estiver suja nos arquivos do merge.
 *                                   NUNCA usa reset --hard. Exit 0 = ok, 1 = erro.
 *
 * Variáveis p/ teste: SB_ROOT (raiz do repo), SB_SKIP_INSTALL=1 (pula npm/models).
 */
import { execFileSync, execSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareVersions, parseAppVersion, parseLatestListedVersion, parseNotesFor } from './update-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.SB_ROOT ?? join(HERE, '..');
const SCRIPTS = join(ROOT, 'scripts');
const F = {
  available: join(SCRIPTS, '.update-available'),
  publicCopy: join(ROOT, 'public', 'update-available.json'),
  result: join(SCRIPTS, '.update-result'),
  log: join(SCRIPTS, '.update.log'),
};
const VERSION_FILE = 'src/app/core/app-version.ts';
const NOTES_FILE = 'src/app/core/release-notes.ts';
const ENV_FILE = 'src/environments/environment.ts';
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000; // anti-loop expira em 24h
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };

function log(msg) {
  try {
    mkdirSync(SCRIPTS, { recursive: true });
    appendFileSync(F.log, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    /* log é best-effort */
  }
}

function git(args, timeout = 30_000) {
  return execFileSync('git', args, {
    cwd: ROOT,
    env: GIT_ENV,
    timeout,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function rmQuiet(path) {
  try {
    rmSync(path, { force: true });
  } catch {
    /* ok */
  }
}

function localVersion() {
  try {
    return parseAppVersion(readFileSync(join(ROOT, VERSION_FILE), 'utf8'));
  } catch {
    return null;
  }
}

function gitShowQuiet(path) {
  try {
    return git(['show', `origin/main:${path}`]);
  } catch {
    return '';
  }
}

/** Versão + notas de origin/main (sem alterar a árvore). */
function remoteInfo() {
  const notesSrc = gitShowQuiet(NOTES_FILE);
  const version = parseAppVersion(gitShowQuiet(VERSION_FILE)) ?? parseLatestListedVersion(notesSrc);
  return version ? { version, notes: parseNotesFor(notesSrc, version) } : null;
}

function clearFlags() {
  rmQuiet(F.available);
  rmQuiet(F.publicCopy);
}

/** Anti-loop: a última tentativa de apply desta mesma versão falhou? */
function alreadyFailedFor(version) {
  const r = readJson(F.result);
  const recent = Date.now() - Date.parse(r?.finishedAt ?? 0) < RETRY_AFTER_MS;
  return r?.status === 'error' && r.targetVersion === version && recent;
}

function publishFlag(current, remote) {
  const json = JSON.stringify(
    {
      currentVersion: current,
      latestVersion: remote.version,
      commit: git(['rev-parse', 'origin/main']),
      notes: remote.notes,
      checkedAt: new Date().toISOString(),
    },
    null,
    2,
  );
  mkdirSync(join(ROOT, 'public'), { recursive: true });
  mkdirSync(SCRIPTS, { recursive: true });
  writeFileSync(F.available, json);
  writeFileSync(F.publicCopy, json);
  log(`check: update disponível ${current} -> ${remote.version}.`);
}

function evaluate() {
  const current = localVersion();
  const remote = remoteInfo();
  if (!current || !remote || compareVersions(remote.version, current) <= 0) {
    clearFlags();
  } else if (alreadyFailedFor(remote.version)) {
    log(`check: ${remote.version} já falhou no apply — não re-sinalizo (anti-loop).`);
    clearFlags();
  } else {
    publishFlag(current, remote);
  }
}

function check() {
  try {
    git(['fetch', 'origin'], Number(process.env.SB_FETCH_TIMEOUT_MS) || 15_000);
  } catch (e) {
    log(`check: fetch falhou/offline (${String(e.message).split('\n')[0]}) — sem update.`);
    return 0;
  }
  try {
    evaluate();
  } catch (e) {
    log(`check: erro ao comparar (${e.message}) — sem update.`);
  }
  return 0;
}

/** Arquivos RASTREADOS modificados localmente (ignora untracked e o environment.ts). */
function dirtyTracked() {
  return git(['status', '--porcelain', '--untracked-files=no'])
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop())
    .filter((f) => f !== ENV_FILE);
}

function isSkipWorktree(file) {
  return git(['ls-files', '-v', '--', file]).startsWith('S');
}

/** Pré-condição: lança Error com mensagem p/ o dono se há sujeira que o merge tocaria. */
function assertCleanForMerge() {
  const incoming = new Set(git(['diff', '--name-only', 'HEAD', 'origin/main']).split('\n').filter(Boolean));
  const clash = dirtyTracked().filter((f) => incoming.has(f));
  if (clash.length > 0) {
    throw new Error(
      `Há alterações locais não salvas em arquivos que a atualização vai mexer (${clash.join(', ')}). ` +
        'Salve (commit) ou descarte essas alterações e tente de novo. Nada foi alterado.',
    );
  }
  return incoming;
}

/** Merge ff-only preservando o environment.ts local (skip-worktree). */
function mergePreservingEnv(incoming) {
  const envPath = join(ROOT, ENV_FILE);
  const backup = join(SCRIPTS, '.environment.ts.bak');
  const protectEnv = existsSync(envPath) && isSkipWorktree(ENV_FILE);
  const templateChanged = incoming.has(ENV_FILE);
  if (protectEnv) {
    mkdirSync(SCRIPTS, { recursive: true });
    copyFileSync(envPath, backup);
    git(['update-index', '--no-skip-worktree', '--', ENV_FILE]);
    if (templateChanged) {
      git(['checkout', '--', ENV_FILE]); // volta ao template p/ o merge não conflitar
    }
  }
  try {
    git(['merge', '--ff-only', 'origin/main'], 120_000);
  } finally {
    if (protectEnv) {
      copyFileSync(backup, envPath);
      git(['update-index', '--skip-worktree', '--', ENV_FILE]);
      rmQuiet(backup);
    }
  }
  return protectEnv && templateChanged;
}

function installDeps() {
  if (process.env.SB_SKIP_INSTALL === '1') {
    log('apply: install/models pulados (SB_SKIP_INSTALL=1).');
    return;
  }
  const opts = { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] };
  execSync('npm install', { ...opts, timeout: 600_000 });
  log('apply: npm install ok.');
  execSync('node scripts/fetch-models.mjs', { ...opts, timeout: 900_000 });
  log('apply: models:fetch ok.');
}

function writeResult(r) {
  try {
    mkdirSync(SCRIPTS, { recursive: true });
    writeFileSync(F.result, JSON.stringify({ ...r, finishedAt: new Date().toISOString() }, null, 2));
  } catch {
    /* best-effort */
  }
}

function runApply(from) {
  git(['fetch', 'origin'], 60_000);
  const target = remoteInfo()?.version ?? null;
  log(`apply: ${from} -> ${target ?? '?'}`);
  const envTemplateChanged = mergePreservingEnv(assertCleanForMerge());
  if (envTemplateChanged) {
    log(`apply: AVISO — o template ${ENV_FILE} mudou no repositório; confira se o seu local precisa dos novos campos.`);
  }
  installDeps();
  return { target, envTemplateChanged };
}

function apply() {
  rmQuiet(F.log);
  const from = localVersion();
  let target = null;
  try {
    const r = runApply(from);
    target = r.target;
    clearFlags();
    writeResult({
      status: 'ok',
      fromVersion: from,
      targetVersion: target,
      envTemplateChanged: r.envTemplateChanged,
      message: `Atualizado para a versão ${target}.`,
    });
    log('apply: concluído com sucesso.');
    return 0;
  } catch (e) {
    const clean = String(e.message ?? '').startsWith('Há alterações');
    const detail = String(e.stderr || e.message || e).trim().split('\n').slice(-3).join(' ');
    const message = clean ? e.message : `A atualização falhou: ${detail}`;
    log(`apply: ERRO — ${message}`);
    target ??= safeRemoteVersion();
    writeResult({ status: 'error', fromVersion: from, targetVersion: target, message });
    clearFlags(); // anti-loop: não re-sinaliza a mesma versão
    return 1;
  }
}

function safeRemoteVersion() {
  try {
    return remoteInfo()?.version ?? null;
  } catch {
    return null;
  }
}

export function main(cmd) {
  if (cmd === 'check') {
    try {
      return check();
    } catch {
      return 0; // check NUNCA falha
    }
  }
  if (cmd === 'apply') {
    return apply();
  }
  console.error('uso: node scripts/update.mjs <check|apply>');
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv[2]));
}
