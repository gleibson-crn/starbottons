import { makeImageData } from './image-data';

/**
 * boxBlur — desfoque de caixa SEPARÁVEL (passada horizontal + vertical, janela
 * 2r+1), com soma deslizante (sliding-window) → custo O(1) por pixel,
 * independente do raio. Preserva o alpha do `src` (só borra os canais 0..2) e
 * trata a borda por CLAMP (índices saturados). Função PURA e DETERMINÍSTICA
 * (ImageData→ImageData): base do pré-passo dos efeitos de estilo (ADR-019).
 */
export function boxBlur(src: ImageData, radiusPx: number): ImageData {
  const r = Math.max(1, Math.round(radiusPx));
  const { width: w, height: h } = src;
  const tmp = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    blurRow(src.data, tmp, w, y, r);
  }
  const out = new Uint8ClampedArray(src.data.length);
  for (let x = 0; x < w; x++) {
    blurCol(tmp, out, w, h, x, r);
  }
  for (let i = 0; i < src.data.length; i += 4) {
    out[i + 3] = src.data[i + 3];
  }
  return makeImageData(out, w, h);
}

/** Índice clampeado ao intervalo válido [0, n-1] (borda por repetição). */
function clampIdx(v: number, n: number): number {
  if (v < 0) {
    return 0;
  }
  return v >= n ? n - 1 : v;
}

/** Passada horizontal de uma linha: src (stride 4) → tmp RGB (stride 3). */
function blurRow(src: Uint8ClampedArray, tmp: Float32Array, w: number, y: number, r: number): void {
  const base = y * w;
  const win = 2 * r + 1;
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let k = -r; k <= r; k++) {
    const i = (base + clampIdx(k, w)) * 4;
    s0 += src[i];
    s1 += src[i + 1];
    s2 += src[i + 2];
  }
  for (let x = 0; x < w; x++) {
    const t = (base + x) * 3;
    tmp[t] = s0 / win;
    tmp[t + 1] = s1 / win;
    tmp[t + 2] = s2 / win;
    const rem = (base + clampIdx(x - r, w)) * 4;
    const add = (base + clampIdx(x + r + 1, w)) * 4;
    s0 += src[add] - src[rem];
    s1 += src[add + 1] - src[rem + 1];
    s2 += src[add + 2] - src[rem + 2];
  }
}

/** Passada vertical de uma coluna: tmp RGB (stride 3) → out (stride 4). */
function blurCol(tmp: Float32Array, out: Uint8ClampedArray, w: number, h: number, x: number, r: number): void {
  const win = 2 * r + 1;
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let k = -r; k <= r; k++) {
    const t = (clampIdx(k, h) * w + x) * 3;
    s0 += tmp[t];
    s1 += tmp[t + 1];
    s2 += tmp[t + 2];
  }
  for (let y = 0; y < h; y++) {
    const o = (y * w + x) * 4;
    out[o] = s0 / win;
    out[o + 1] = s1 / win;
    out[o + 2] = s2 / win;
    const rem = (clampIdx(y - r, h) * w + x) * 3;
    const add = (clampIdx(y + r + 1, h) * w + x) * 3;
    s0 += tmp[add] - tmp[rem];
    s1 += tmp[add + 1] - tmp[rem + 1];
    s2 += tmp[add + 2] - tmp[rem + 2];
  }
}
