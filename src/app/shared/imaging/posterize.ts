import { makeImageData } from './image-data';

/**
 * posterize — posterização por VALOR (preserva matiz e saturação). Quantiza só
 * o BRILHO V = max(r,g,b) em `levels` faixas (2..8) e reescala o RGB pelo fator
 * vq/v, mantendo a proporção entre canais (o matiz não muda) — ao contrário da
 * posterização por canal, que gera manchas de cor. Função PURA e DETERMINÍSTICA
 * (ImageData→ImageData): mesmo `src`+`levels` → mesmos pixels. Alpha preservado.
 */
export function posterize(src: ImageData, levels: number): ImageData {
  const steps = Math.max(2, Math.min(8, Math.round(levels)));
  const div = steps - 1;
  const s = src.data;
  const out = new Uint8ClampedArray(s.length);
  for (let i = 0; i < s.length; i += 4) {
    posterizePixel(s, out, i, div);
  }
  return makeImageData(out, src.width, src.height);
}

/** Quantiza o brilho de um pixel e reescala o RGB preservando o matiz. */
function posterizePixel(s: Uint8ClampedArray, out: Uint8ClampedArray, i: number, div: number): void {
  const r = s[i];
  const g = s[i + 1];
  const b = s[i + 2];
  const v = Math.max(r, g, b);
  out[i + 3] = s[i + 3];
  if (v === 0) {
    out[i] = 0;
    out[i + 1] = 0;
    out[i + 2] = 0;
    return;
  }
  const vq = Math.round((Math.round((v / 255) * div) / div) * 255);
  const f = vq / v;
  out[i] = r * f;
  out[i + 1] = g * f;
  out[i + 2] = b * f;
}
