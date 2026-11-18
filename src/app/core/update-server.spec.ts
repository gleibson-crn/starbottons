import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

interface Srv {
  createUpdateServer(): import('node:http').Server;
}

describe('scripts/update-server.mjs (POST /do-update)', () => {
  let root: string;
  let server: import('node:http').Server;
  let base: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'sb-srv-'));
    process.env['SB_ROOT'] = root;
    const url = pathToFileURL(join(process.cwd(), 'scripts', 'update-server.mjs')).href;
    const mod = (await import(/* @vite-ignore */ url)) as Srv;
    server = mod.createUpdateServer();
    await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
    delete process.env['SB_ROOT'];
    rmSync(root, { recursive: true, force: true });
  });

  const flag = () => join(root, 'scripts', '.do-update');

  it('grava o flag fixo com targetVersion e responde 200 com CORS localhost', async () => {
    const r = await fetch(`${base}/do-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:4200' },
      body: JSON.stringify({ targetVersion: '1.3.0' }),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe('http://localhost:4200');
    const data = JSON.parse(readFileSync(flag(), 'utf8'));
    expect(data.targetVersion).toBe('1.3.0');
    expect(data.requestedAt).toBeTruthy();
  });

  it('rejeita origem não-localhost (403), outras rotas (404) e outros métodos (405)', async () => {
    rmSync(flag(), { force: true });
    const evil = await fetch(`${base}/do-update`, { method: 'POST', headers: { Origin: 'https://evil.com' } });
    expect(evil.status).toBe(403);
    expect(existsSync(flag())).toBe(false);
    expect((await fetch(`${base}/../../etc/passwd`, { method: 'POST' })).status).toBe(404);
    expect((await fetch(`${base}/outra`, { method: 'POST' })).status).toBe(404);
    expect((await fetch(`${base}/do-update`)).status).toBe(405);
  });
});
