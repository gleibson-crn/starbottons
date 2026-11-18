import { makeImageData } from './image-data';
import { pencilSketch } from './pencil-sketch';

const OPTS = { blurPx: 1, gain: 12, gamma: 0.75 };

/** Imagem w×h de luminância uniforme (alpha 255). */
function solid(value: number, side = 8): ImageData {
  const data = new Uint8ClampedArray(side * side * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  return makeImageData(data, side, side);
}

/** Imagem side×side com metade esquerda preta e direita branca (borda forte). */
function verticalEdge(side = 8): ImageData {
  const data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const k = (y * side + x) * 4;
      const v = x < side / 2 ? 0 : 255;
      data[k] = v;
      data[k + 1] = v;
      data[k + 2] = v;
      data[k + 3] = 255;
    }
  }
  return makeImageData(data, side, side);
}

/** Menor cinza (canal R) presente na saída. */
function minGray(out: ImageData): number {
  let min = 255;
  for (let i = 0; i < out.data.length; i += 4) {
    min = Math.min(min, out.data[i]);
  }
  return min;
}

describe('pencilSketch', () => {
  it('uma borda forte vira traço escuro (cinza mínimo bem abaixo de 255)', () => {
    const out = pencilSketch(verticalEdge(), OPTS);
    expect(minGray(out)).toBeLessThan(128);
  });

  it('área chapada fica ~branca (sem gradiente = sem tinta)', () => {
    const out = pencilSketch(solid(120), OPTS);
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(255);
    }
  });

  it('produz saída em cinza (R=G=B em cada pixel)', () => {
    const out = pencilSketch(verticalEdge(), OPTS);
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i + 1]).toBe(out.data[i]);
      expect(out.data[i + 2]).toBe(out.data[i]);
    }
  });

  it('preserva o alpha original', () => {
    const out = pencilSketch(solid(120), OPTS);
    expect(out.data[3]).toBe(255);
  });

  it('é DETERMINÍSTICO', () => {
    const a = pencilSketch(verticalEdge(), OPTS);
    const b = pencilSketch(verticalEdge(), OPTS);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });
});
