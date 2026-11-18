import { makeImageData } from './image-data';
import { quantizeColors } from './quantize-colors';

/** ImageData 2×2 a partir de 4 cores RGBA. */
function img(pixels: number[][]): ImageData {
  const data = new Uint8ClampedArray(pixels.flat());
  return makeImageData(data, 2, 2);
}

/** Conjunto de cores RGB distintas presentes na saída. */
function palette(out: ImageData): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < out.data.length; i += 4) {
    set.add(`${out.data[i]},${out.data[i + 1]},${out.data[i + 2]}`);
  }
  return set;
}

const FOUR = img([
  [255, 0, 0, 255], // vermelho
  [255, 10, 0, 255], // quase-vermelho
  [0, 0, 255, 255], // azul
  [0, 10, 255, 255], // quase-azul
]);

describe('quantizeColors (median-cut determinístico)', () => {
  it('reduz a paleta a N cores', () => {
    expect(palette(quantizeColors(FOUR, 2)).size).toBe(2);
  });

  it('é ESTÁVEL entre duas execuções (mesmos pixels)', () => {
    const a = quantizeColors(FOUR, 2);
    const b = quantizeColors(FOUR, 2);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('preserva o alpha', () => {
    const out = quantizeColors(FOUR, 2);
    for (let i = 3; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(255);
    }
  });

  it('separa vermelhos de azuis em duas médias distintas', () => {
    const out = quantizeColors(FOUR, 2);
    // pixel 0 (vermelho) e pixel 2 (azul) caem em caixas diferentes.
    const c0 = `${out.data[0]},${out.data[1]},${out.data[2]}`;
    const c2 = `${out.data[8]},${out.data[9]},${out.data[10]}`;
    expect(c0).not.toBe(c2);
  });
});
