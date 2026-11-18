/**
 * Fonte de verdade da versão do app (semver). Incrementar a cada release, junto
 * com `package.json` (um teste garante que os dois batem) e `release-notes.ts`.
 * O auto-update (`scripts/update.mjs`) lê este arquivo de `origin/main`.
 */
export const APP_VERSION = '1.1.0';
