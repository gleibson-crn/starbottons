/**
 * Pós-processamento PURO do "Remover fundo" (sem DOM). Recebe o RGBA cujo alfa é
 * o matte do modelo e devolve um RGBA em que só os objetos PRINCIPAIS ficam
 * visíveis: o maior componente conectado + todo componente com área ≥
 * `KEEP_COMPONENT_RATIO` do maior (grupos de 2+ pessoas). Ilhas pequenas
 * (reflexos) e o resto viram transparentes. Dentro dos componentes mantidos o
 * alfa ORIGINAL é preservado (bordas suaves de cabelo).
 */

/** Subconjunto estrutural de `ImageData` (permite testar sem DOM). */
export interface RgbaBuffer {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** Componente com área ≥ esta fração do MAIOR também é mantido. */
export const KEEP_COMPONENT_RATIO = 0.15;

/** Limiar de alfa padrão (0..255) que separa "objeto" de "fundo". */
export const DEFAULT_CUTOUT_THRESHOLD = 40;

/** Faixa do slider "Sensibilidade da borda". */
export const CUTOUT_THRESHOLD_MIN = 1;
export const CUTOUT_THRESHOLD_MAX = 200;

interface Labeling {
  /** Rótulo do componente por pixel (-1 = fundo). */
  readonly labels: Int32Array;
  /** Área (nº de pixels) de cada componente, indexada pelo rótulo. */
  readonly sizes: number[];
}

/** Máscara 0/1: alfa ≥ limiar. */
function foregroundMask(rgba: Uint8ClampedArray, pixels: number, threshold: number): Uint8Array {
  const fg = new Uint8Array(pixels);
  for (let p = 0, i = 3; p < pixels; p++, i += 4) {
    fg[p] = rgba[i] >= threshold ? 1 : 0;
  }
  return fg;
}

/** Empilha o vizinho se for objeto ainda não rotulado. */
function visit(q: number, label: number, fg: Uint8Array, labels: Int32Array, stack: Int32Array, top: number): number {
  if (fg[q] === 1 && labels[q] === -1) {
    labels[q] = label;
    stack[top] = q;
    return top + 1;
  }
  return top;
}

/** Flood fill iterativo (pilha, 4-conexo) a partir de `seed`; devolve a área. */
function floodFill(seed: number, label: number, fg: Uint8Array, labels: Int32Array, stack: Int32Array, w: number, h: number): number {
  let top = 0;
  stack[top++] = seed;
  labels[seed] = label;
  let size = 0;
  while (top > 0) {
    const p = stack[--top];
    size++;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) top = visit(p - 1, label, fg, labels, stack, top);
    if (x < w - 1) top = visit(p + 1, label, fg, labels, stack, top);
    if (y > 0) top = visit(p - w, label, fg, labels, stack, top);
    if (y < h - 1) top = visit(p + w, label, fg, labels, stack, top);
  }
  return size;
}

/** Rotula os componentes conectados (4-conexo) da máscara. */
function labelComponents(fg: Uint8Array, w: number, h: number): Labeling {
  const total = w * h;
  const labels = new Int32Array(total).fill(-1);
  const stack = new Int32Array(total);
  const sizes: number[] = [];
  for (let s = 0; s < total; s++) {
    if (fg[s] === 1 && labels[s] === -1) {
      sizes.push(floodFill(s, sizes.length, fg, labels, stack, w, h));
    }
  }
  return { labels, sizes };
}

/** Rótulos mantidos: o maior e todo componente com área ≥ ratio × maior. */
function keptLabels(sizes: readonly number[], ratio: number): Uint8Array {
  const biggest = sizes.reduce((m, s) => Math.max(m, s), 0);
  const keep = new Uint8Array(sizes.length);
  sizes.forEach((size, label) => {
    keep[label] = size > 0 && size >= biggest * ratio ? 1 : 0;
  });
  return keep;
}

/**
 * Mantém só o(s) objeto(s) principal(is). Não muta `src`; devolve um novo buffer
 * RGBA. `threshold` (0..255) é o limiar de alfa que define o que é "objeto".
 */
export function keepMainComponents(
  src: RgbaBuffer,
  threshold: number = DEFAULT_CUTOUT_THRESHOLD,
  ratio: number = KEEP_COMPONENT_RATIO,
): RgbaBuffer {
  const { width: w, height: h } = src;
  const pixels = w * h;
  const out = new Uint8ClampedArray(src.data);
  const fg = foregroundMask(src.data, pixels, threshold);
  const { labels, sizes } = labelComponents(fg, w, h);
  const keep = keptLabels(sizes, ratio);
  for (let p = 0, i = 3; p < pixels; p++, i += 4) {
    const label = labels[p];
    if (label < 0 || keep[label] === 0) {
      out[i] = 0;
    }
  }
  return { data: out, width: w, height: h };
}
