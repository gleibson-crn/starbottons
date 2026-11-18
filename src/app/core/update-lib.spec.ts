import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

interface Lib {
  compareVersions(a: string, b: string): number;
  parseAppVersion(src: string): string | null;
  parseNotesFor(src: string, v: string): string[];
  parseLatestListedVersion(src: string): string | null;
}

async function loadLib(): Promise<Lib> {
  const url = pathToFileURL(join(process.cwd(), 'scripts', 'update-lib.mjs')).href;
  return (await import(/* @vite-ignore */ url)) as Lib;
}

describe('scripts/update-lib.mjs', () => {
  it('compareVersions numérico: 1.10.0 > 1.2.0, iguais e segmentos', async () => {
    const lib = await loadLib();
    expect(lib.compareVersions('1.10.0', '1.2.0')).toBeGreaterThan(0);
    expect(lib.compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(lib.compareVersions('1.2.0', '1.2.0')).toBe(0);
    expect(lib.compareVersions('1.2', '1.2.0')).toBe(0);
    expect(lib.compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('parseAppVersion lê APP_VERSION', async () => {
    const lib = await loadLib();
    expect(lib.parseAppVersion("export const APP_VERSION = '1.10.2';\n")).toBe('1.10.2');
    expect(lib.parseAppVersion('export const APP_VERSION: string = "2.0.0";')).toBe('2.0.0');
    expect(lib.parseAppVersion('nada aqui')).toBeNull();
  });

  it('parseNotesFor extrai as notas da versão certa (aspas, apóstrofo, escape)', async () => {
    const lib = await loadLib();
    const src = [
      'export const RELEASE_NOTES = [',
      `  { version: '1.2.0', date: '2026-12-01', notes: ['Nova A', "Nota com 'aspas'", 'It\\'s ok'] },`,
      "  { version: '1.1.0', date: '2026-11-18', notes: ['Antiga'] },",
      '];',
    ].join('\n');
    expect(lib.parseNotesFor(src, '1.2.0')).toEqual(['Nova A', "Nota com 'aspas'", "It's ok"]);
    expect(lib.parseNotesFor(src, '1.1.0')).toEqual(['Antiga']);
    expect(lib.parseNotesFor(src, '9.9.9')).toEqual([]);
  });

  it('parseLatestListedVersion escolhe a maior numericamente', async () => {
    const lib = await loadLib();
    expect(lib.parseLatestListedVersion("{version:'1.2.0'},{version:'1.10.0'}")).toBe('1.10.0');
  });
});
