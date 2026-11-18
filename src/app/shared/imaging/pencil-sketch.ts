import { boxBlur } from './box-blur';
import { makeImageData } from './image-data';

/** Opções do traço de lápis. */
export interface SketchOptions {
  /** Raio do pré-desfoque (px): suaviza a foto antes do gradiente. */
  readonly blurPx: number;
  /** Ganho aplicado à magnitude do gradiente (realça traços fracos). */
  readonly gain: number;
  /** Gama da resposta da tinta (< 1 = traço mais presente). */
  readonly gamma: number;
}

/** Magnitude máxima teórica do operador Sobel (normalização do gradiente). */
const SOBEL_MAX = 1442; // sqrt((4*255)^2 + (4*255)^2)

/** Contexto de um pixel (evita aridade alta em gradientAt/writeInk). */
interface PixelCtx {
  readonly w: number;
  readonly h: number;
  readonly x: number;
  readonly y: number;
}

/**
 * pencilSketch — traço de LÁPIS contínuo, robusto em fotos suaves (substitui a
 * borda binária do antigo Sobel). Fluxo: pré-desfoque (boxBlur) → luminância
 * Rec.601 → magnitude do gradiente Sobel 3×3 → tinta = pow(min(1, mag/1442 *
 * gain), gamma) → cinza 255*(1-tinta). Área chapada fica ~branca; bordas fortes
 * viram traço escuro. Função PURA e DETERMINÍSTICA; o alpha do `src` é preservado.
 */
export function pencilSketch(src: ImageData, opts: SketchOptions): ImageData {
  const bl = boxBlur(src, opts.blurPx);
  const { width: w, height: h } = src;
  const lum = toLuminance(bl);
  const out = new Uint8ClampedArray(src.data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      writeInk(out, lum, { w, h, x, y }, opts);
    }
  }
  for (let i = 0; i < src.data.length; i += 4) {
    out[i + 3] = src.data[i + 3];
  }
  return makeImageData(out, w, h);
}

/** Luminância perceptual (Rec. 601) por pixel. */
function toLuminance(src: ImageData): Float32Array {
  const s = src.data;
  const lum = new Float32Array(s.length / 4);
  for (let p = 0, i = 0; i < s.length; i += 4, p++) {
    lum[p] = 0.299 * s[i] + 0.587 * s[i + 1] + 0.114 * s[i + 2];
  }
  return lum;
}

/** Magnitude do gradiente Sobel; bordas da imagem = 0 (sem vizinhança). */
function gradientAt(lum: Float32Array, p: PixelCtx): number {
  if (p.x <= 0 || p.y <= 0 || p.x >= p.w - 1 || p.y >= p.h - 1) {
    return 0;
  }
  const i = p.y * p.w + p.x;
  const w = p.w;
  const tl = lum[i - w - 1];
  const tc = lum[i - w];
  const tr = lum[i - w + 1];
  const ml = lum[i - 1];
  const mr = lum[i + 1];
  const bl = lum[i + w - 1];
  const bc = lum[i + w];
  const br = lum[i + w + 1];
  const gx = tl + 2 * ml + bl - (tr + 2 * mr + br);
  const gy = tl + 2 * tc + tr - (bl + 2 * bc + br);
  return Math.hypot(gx, gy);
}

/** Calcula a tinta do pixel e grava o cinza correspondente na saída. */
function writeInk(out: Uint8ClampedArray, lum: Float32Array, p: PixelCtx, opts: SketchOptions): void {
  const mag = gradientAt(lum, p);
  const ink = Math.pow(Math.min(1, (mag / SOBEL_MAX) * opts.gain), opts.gamma);
  const v = 255 * (1 - ink);
  const k = (p.y * p.w + p.x) * 4;
  out[k] = v;
  out[k + 1] = v;
  out[k + 2] = v;
}
