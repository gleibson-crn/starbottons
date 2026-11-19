/**
 * Dígitos 0-9 como VETOR 7-segmentos (porte fiel de generate-art/digits.ts).
 * O resvg roda sem fontes → `<text>` não renderiza; cada dígito é retângulos
 * num grid normalizado (largura 1 × altura 1.8).
 */

const CELL_W = 1;
const CELL_H = 1.8;
const GAP = 0.3;
const T = 0.22; // espessura do segmento

/** a(topo) b(sup-dir) c(inf-dir) d(base) e(inf-esq) f(sup-esq) g(meio). */
const SEGMENTS = {
  '0': [true, true, true, true, true, true, false],
  '1': [false, true, true, false, false, false, false],
  '2': [true, true, false, true, true, false, true],
  '3': [true, true, true, true, false, false, true],
  '4': [false, true, true, false, false, true, true],
  '5': [true, false, true, true, false, true, true],
  '6': [true, false, true, true, true, true, true],
  '7': [true, true, true, false, false, false, false],
  '8': [true, true, true, true, true, true, true],
  '9': [true, true, true, true, false, true, true],
};

/** Retângulos [x,y,w,h] de cada segmento no grid da célula. */
const RECTS = [
  [0, 0, CELL_W, T], // a
  [CELL_W - T, 0, T, CELL_H / 2 + T / 2], // b
  [CELL_W - T, CELL_H / 2 - T / 2, T, CELL_H / 2 + T / 2], // c
  [0, CELL_H - T, CELL_W, T], // d
  [0, CELL_H / 2 - T / 2, T, CELL_H / 2 + T / 2], // e
  [0, 0, T, CELL_H / 2 + T / 2], // f
  [0, CELL_H / 2 - T / 2, CELL_W, T], // g
];

/** Largura natural (grid) de um texto de `n` dígitos. */
function naturalWidth(n) {
  return n <= 0 ? 0 : n * CELL_W + (n - 1) * GAP;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Dígitos de `text` (só [0-9]) centrados em (cx,cy), com altura `h` e cor
 * `color`. Se a largura natural exceder `maxWidth`, comprime SÓ na horizontal.
 */
function digitsBlock(text, cx, cy, h, color, maxWidth = Infinity) {
  const chars = [...text].filter((ch) => ch in SEGMENTS);
  const sy = h / CELL_H;
  const natural = naturalWidth(chars.length) * sy;
  const sx = natural > maxWidth ? maxWidth / naturalWidth(chars.length) : sy;
  const width = naturalWidth(chars.length) * sx;
  const x0 = cx - width / 2;
  const y0 = cy - h / 2;
  const rects = [];
  chars.forEach((ch, i) => {
    const ox = x0 + i * (CELL_W + GAP) * sx;
    SEGMENTS[ch].forEach((on, s) => {
      if (!on) return;
      const [rx, ry, rw, rh] = RECTS[s];
      rects.push(
        `<rect x="${round(ox + rx * sx)}" y="${round(y0 + ry * sy)}" width="${round(rw * sx)}" height="${round(rh * sy)}"/>`,
      );
    });
  });
  const svg = rects.length
    ? `<g id="sequence-number" fill="${color}">${rects.join('')}</g>`
    : '';
  return { svg, x: x0, y: y0, width, height: h };
}

module.exports = { CELL_W, CELL_H, GAP, SEGMENTS, naturalWidth, digitsBlock };
