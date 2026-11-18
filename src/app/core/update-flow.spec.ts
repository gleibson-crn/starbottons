import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts', 'update.mjs');
const GIT_ID = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false'];
const NOTES = (v: string, n: string) =>
  `export const RELEASE_NOTES = [{ version: '${v}', date: '2026-12-01', notes: ['${n}'] }];\n`;
const ENV = 'src/environments/environment.ts';
const OTHER = 'src/app/other.ts';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', [...GIT_ID, ...args], { cwd, encoding: 'utf8' }).trim();
}

function put(root: string, rel: string, content: string): void {
  const p = join(root, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content);
}

function release(root: string, version: string, note: string, extra: Record<string, string> = {}): void {
  put(root, 'src/app/core/app-version.ts', `export const APP_VERSION = '${version}';\n`);
  put(root, 'src/app/core/release-notes.ts', NOTES(version, note));
  for (const [k, v] of Object.entries(extra)) {
    put(root, k, v);
  }
  git(root, 'add', '-A');
  git(root, 'commit', '-m', `release ${version}`);
  git(root, 'push', 'origin', 'main');
}

function run(root: string, cmd: 'check' | 'apply'): number {
  const r = spawnSync('node', [SCRIPT, cmd], {
    env: { ...process.env, SB_ROOT: root, SB_SKIP_INSTALL: '1', SB_FETCH_TIMEOUT_MS: '90000' },
    encoding: 'utf8',
  });
  return r.status ?? -1;
}

const flag = (root: string) => join(root, 'scripts', '.update-available');
const pub = (root: string) => join(root, 'public', 'update-available.json');
const read = (root: string, rel: string) => readFileSync(join(root, rel), 'utf8');
const result = (root: string) => JSON.parse(read(root, 'scripts/.update-result'));

describe('update.mjs contra repo git temporário', () => {
  let base: string;
  let seed: string;
  let app: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'sb-update-'));
    const bare = join(base, 'remote.git');
    seed = join(base, 'seed');
    app = join(base, 'app');
    execFileSync('git', ['init', '--bare', '-b', 'main', bare]);
    mkdirSync(seed);
    git(seed, 'init', '-b', 'main');
    git(seed, 'remote', 'add', 'origin', bare);
    release(seed, '1.2.0', 'Inicial', {
      [OTHER]: 'v1\n',
      [ENV]: "export const environment = { key: 'TEMPLATE' };\n",
    });
    execFileSync('git', ['clone', bare, app]);
  }, 60_000);

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('check: sem versão nova não cria flag e apaga flag obsoleto', () => {
    put(app, 'scripts/.update-available', '{}');
    put(app, 'public/update-available.json', '{}');
    expect(run(app, 'check')).toBe(0);
    expect(existsSync(flag(app))).toBe(false);
    expect(existsSync(pub(app))).toBe(false);
  }, 60_000);

  it('check: versão maior (1.10.0 > 1.2.0) escreve o flag e a cópia pública', () => {
    release(seed, '1.10.0', 'Novidade X');
    expect(run(app, 'check')).toBe(0);
    const data = JSON.parse(readFileSync(flag(app), 'utf8'));
    expect(data).toMatchObject({ currentVersion: '1.2.0', latestVersion: '1.10.0', notes: ['Novidade X'] });
    expect(data.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(data.checkedAt).toBeTruthy();
    expect(readFileSync(pub(app), 'utf8')).toBe(readFileSync(flag(app), 'utf8'));
  }, 60_000);

  it('check: offline (origin inválido) sai 0 e sem flag', () => {
    git(app, 'remote', 'set-url', 'origin', join(base, 'nao-existe.git'));
    expect(run(app, 'check')).toBe(0);
    expect(existsSync(flag(app))).toBe(false);
  }, 60_000);

  it('apply: faz ff-only, grava resultado ok e remove os flags', () => {
    release(seed, '1.3.0', 'Nova', { [OTHER]: 'v2\n' });
    run(app, 'check');
    expect(existsSync(flag(app))).toBe(true);
    expect(run(app, 'apply')).toBe(0);
    expect(read(app, OTHER).trim()).toBe('v2');
    expect(result(app)).toMatchObject({ status: 'ok', fromVersion: '1.2.0', targetVersion: '1.3.0' });
    expect(existsSync(flag(app))).toBe(false);
    expect(existsSync(join(app, 'scripts', '.update.log'))).toBe(true);
  }, 60_000);

  it('apply: árvore suja num arquivo do merge ABORTA sem tocar e não re-sinaliza (anti-loop)', () => {
    release(seed, '1.3.0', 'Nova', { [OTHER]: 'v2\n' });
    put(app, OTHER, 'minha edicao\n');
    expect(run(app, 'apply')).toBe(1);
    expect(read(app, OTHER)).toBe('minha edicao\n');
    expect(git(app, 'log', '-1', '--format=%s')).toBe('release 1.2.0');
    const r = result(app);
    expect(r.status).toBe('error');
    expect(r.message).toContain('other.ts');
    run(app, 'check');
    expect(existsSync(flag(app))).toBe(false);
  }, 60_000);

  it('apply: preserva environment.ts local (skip-worktree) mesmo com o template mudando', () => {
    git(app, 'update-index', '--skip-worktree', ENV);
    put(app, ENV, "export const environment = { key: 'MINHA' };\n");
    release(seed, '1.3.0', 'Nova', { [ENV]: "export const environment = { key: 'TEMPLATE', novo: 1 };\n" });
    expect(run(app, 'apply')).toBe(0);
    expect(read(app, ENV)).toContain("'MINHA'");
    expect(git(app, 'ls-files', '-v', ENV)).toMatch(/^S /);
    expect(result(app).envTemplateChanged).toBe(true);
  }, 60_000);

  it('apply: edição local só no environment.ts (skip-worktree) NÃO conta como árvore suja', () => {
    git(app, 'update-index', '--skip-worktree', ENV);
    put(app, ENV, "export const environment = { key: 'MINHA' };\n");
    release(seed, '1.3.0', 'Nova', { [OTHER]: 'v2\n' });
    expect(run(app, 'apply')).toBe(0);
    expect(read(app, ENV)).toContain("'MINHA'");
  }, 60_000);
});
