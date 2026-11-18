import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_VERSION } from './app-version';
import { RELEASE_NOTES } from './release-notes';
import { compareVersions } from './version';

describe('compareVersions (TS)', () => {
  it('compara NUMERICAMENTE por segmento (1.10.0 > 1.2.0)', () => {
    expect(compareVersions('1.10.0', '1.2.0')).toBeGreaterThan(0);
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
  });

  it('versões iguais dão 0, inclusive com segmentos faltando', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
  });

  it('decide pelo primeiro segmento diferente', () => {
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.2.4', '1.2.3')).toBeGreaterThan(0);
  });
});

describe('fonte de versão', () => {
  it('APP_VERSION === version do package.json', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('há notas de release para a versão atual', () => {
    const entry = RELEASE_NOTES.find((r) => r.version === APP_VERSION);
    expect(entry?.notes.length).toBeGreaterThan(0);
  });
});
