// Funções PURAS do auto-update (sem I/O) — testadas em src/app/core/update-lib.spec.ts.

/** Comparação semver NUMÉRICA por segmento: <0 se a<b, 0 se igual, >0 se a>b. */
export function compareVersions(a, b) {
  const parts = (v) =>
    String(v)
      .split('.')
      .map((p) => {
        const n = Number.parseInt(p, 10);
        return Number.isFinite(n) ? n : 0;
      });
  const pa = parts(a);
  const pb = parts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/** Extrai `APP_VERSION = '1.2.3'` do texto de app-version.ts (ou null). */
export function parseAppVersion(source) {
  const m = /APP_VERSION\s*(?::\s*string\s*)?=\s*(['"`])(\d+(?:\.\d+)*)\1/.exec(source ?? '');
  return m ? m[2] : null;
}

const ESCAPES = { n: '\n', t: '\t' };

/** Lê um literal de string TS a partir de `i` (aponta p/ a aspa). Devolve [valor, próximoÍndice]. */
function readString(src, i) {
  const quote = src[i];
  let out = '';
  let j = i + 1;
  while (j < src.length && src[j] !== quote) {
    if (src[j] === '\\' && j + 1 < src.length) {
      out += ESCAPES[src[j + 1]] ?? src[j + 1];
      j += 2;
    } else {
      out += src[j++];
    }
  }
  return [out, j + 1];
}

/** Lê os literais de string de um array cujo conteúdo começa em `i` (logo após o `[`). */
function readStringArray(src, i) {
  const items = [];
  let j = i;
  while (j < src.length && src[j] !== ']') {
    if (src[j] === "'" || src[j] === '"' || src[j] === '`') {
      const [value, next] = readString(src, j);
      items.push(value);
      j = next;
    } else {
      j++;
    }
  }
  return items;
}

/**
 * Notas (strings) da `version` em release-notes.ts. Procura `version: 'X'` e o
 * primeiro `notes: [` depois dele. Retorna [] se não achar (nunca lança).
 */
export function parseNotesFor(source, version) {
  try {
    const esc = version.replace(/\./g, '\\.');
    const v = new RegExp(`version\\s*:\\s*['"\`]${esc}['"\`]`).exec(source ?? '');
    if (!v) {
      return [];
    }
    const rest = source.slice(v.index + v[0].length);
    const n = /notes\s*:\s*\[/.exec(rest);
    return n ? readStringArray(rest, n.index + n[0].length) : [];
  } catch {
    return [];
  }
}

/** Maior `version: 'X'` listada em release-notes.ts (fallback p/ repos sem app-version.ts). */
export function parseLatestListedVersion(source) {
  const all = [...(source ?? '').matchAll(/version\s*:\s*['"`](\d+(?:\.\d+)*)['"`]/g)].map((m) => m[1]);
  return all.sort((a, b) => compareVersions(b, a))[0] ?? null;
}
