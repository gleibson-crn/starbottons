import { halftone } from './halftone';
import { makeImageData } from './image-data';

/** Imagem side×side de cor RGBA uniforme (alpha 255). */
function solid(r: number, g: number, b: number, side = 8): ImageData {
  const data = new Uint8ClampedArray(side * side * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return makeImageData(data, side, side);
}

/** `true` se existe algum pixel com exatamente rgb `(r,g,b)`. */
function hasPixel(out: ImageData, r: number, g: number, b: number): boolean {
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i] === r && out.data[i + 1] === g && out.data[i + 2] === b) {
      return true;
    }
  }
  return false;
}

const OPTS = { cellPx: 4, kScale: 0.65 };

describe('halftone (CMYK colorido)', () => {
  it('vermelho puro → pontos magenta+amarelo cobrem e resulta vermelho', () => {
    // (255,0,0): k=0, c=0, m=1, y=1 → zera G e B, mantém R.
    const out = halftone(solid(255, 0, 0), OPTS);
    expect(hasPixel(out, 255, 0, 0)).toBe(true);
  });

  it('preto → tela K estampa ponto preto', () => {
    // (0,0,0): k=1 → cobertura k*kScale, zera R,G,B.
    const out = halftone(solid(0, 0, 0), OPTS);
    expect(hasPixel(out, 0, 0, 0)).toBe(true);
  });

  it('branco → nenhuma tinta (fica todo branco)', () => {
    const out = halftone(solid(255, 255, 255), OPTS);
    for (let i = 0; i < out.data.length; i += 4) {
      expect([out.data[i], out.data[i + 1], out.data[i + 2]]).toEqual([255, 255, 255]);
    }
  });

  it('preserva o alpha original', () => {
    const out = halftone(solid(0, 0, 0), OPTS);
    expect(out.data[3]).toBe(255);
  });

  it('é DETERMINÍSTICO', () => {
    const a = halftone(solid(64, 128, 200), OPTS);
    const b = halftone(solid(64, 128, 200), OPTS);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });
});
