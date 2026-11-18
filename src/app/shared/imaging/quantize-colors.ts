import { makeImageData } from './image-data';

/**
 * quantizeColors — reduz a imagem a uma paleta de até `colors` cores (2..16)
 * por MEDIAN-CUT DETERMINÍSTICO. NUNCA usa k-means/aleatório: `Math.random` é
 * proibido no projeto e quebraria a paridade preview↔bake. Função PURA — o
 * mesmo `src`+`colors` sempre devolve os mesmos pixels. O alpha é preservado.
 * É a base do preset "Pop Art".
 */
export function quantizeColors(src: ImageData, colors: number): ImageData {
  const target = Math.max(2, Math.min(16, Math.round(colors)));
  const boxes = medianCut(src, target);
  return paint(src, boxes);
}

/** Caixa de cor: índices de pixels (posição no buffer, múltiplo de 4). */
interface Box {
  readonly idx: number[];
}

/** Divide o espaço de cor em `target` caixas por corte na mediana. */
function medianCut(src: ImageData, target: number): Box[] {
  const all: number[] = [];
  for (let i = 0; i < src.data.length; i += 4) {
    all.push(i);
  }
  let boxes: Box[] = [{ idx: all }];
  while (boxes.length < target) {
    const which = pickBox(src.data, boxes);
    if (which < 0) {
      break;
    }
    const [a, b] = splitBox(src.data, boxes[which]);
    boxes = [...boxes.slice(0, which), a, b, ...boxes.slice(which + 1)];
  }
  return boxes;
}

/** Escolhe a caixa com a maior amplitude de canal (−1 se nenhuma divisível). */
function pickBox(data: Uint8ClampedArray, boxes: Box[]): number {
  let best = -1;
  let bestRange = 0;
  for (let i = 0; i < boxes.length; i++) {
    if (boxes[i].idx.length < 2) {
      continue;
    }
    const range = maxRange(data, boxes[i]);
    if (range > bestRange) {
      bestRange = range;
      best = i;
    }
  }
  return best;
}

/** Maior amplitude entre os três canais de uma caixa. */
function maxRange(data: Uint8ClampedArray, box: Box): number {
  const r = channelRange(data, box, 0);
  const g = channelRange(data, box, 1);
  const b = channelRange(data, box, 2);
  return Math.max(r.range, g.range, b.range);
}

/** min/max/amplitude de um canal (0=R,1=G,2=B) numa caixa. */
function channelRange(
  data: Uint8ClampedArray,
  box: Box,
  ch: number,
): { min: number; max: number; range: number } {
  let min = 255;
  let max = 0;
  for (const i of box.idx) {
    const v = data[i + ch];
    if (v < min) {
      min = v;
    }
    if (v > max) {
      max = v;
    }
  }
  return { min, max, range: max - min };
}

/** Divide a caixa no canal de maior amplitude, na mediana (determinístico). */
function splitBox(data: Uint8ClampedArray, box: Box): [Box, Box] {
  const ch = longestChannel(data, box);
  const sorted = [...box.idx].sort((p, q) => data[p + ch] - data[q + ch]);
  const mid = sorted.length >> 1;
  return [{ idx: sorted.slice(0, mid) }, { idx: sorted.slice(mid) }];
}

/** Canal (0/1/2) de maior amplitude na caixa. */
function longestChannel(data: Uint8ClampedArray, box: Box): number {
  const r = channelRange(data, box, 0).range;
  const g = channelRange(data, box, 1).range;
  const b = channelRange(data, box, 2).range;
  if (g >= r && g >= b) {
    return 1;
  }
  return b > r ? 2 : 0;
}

/** Pinta cada pixel com a cor MÉDIA da sua caixa (alpha preservado). */
function paint(src: ImageData, boxes: Box[]): ImageData {
  const s = src.data;
  const out = new Uint8ClampedArray(s.length);
  out.set(s);
  for (const box of boxes) {
    const c = average(s, box);
    for (const i of box.idx) {
      out[i] = c.r;
      out[i + 1] = c.g;
      out[i + 2] = c.b;
    }
  }
  return makeImageData(out, src.width, src.height);
}

/** Cor média (arredondada) dos pixels de uma caixa. */
function average(data: Uint8ClampedArray, box: Box): { r: number; g: number; b: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const i of box.idx) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const n = box.idx.length || 1;
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}
