import { makeImageData } from './image-data';
import { posterize } from './posterize';

/** ImageData a partir de tuplas RGBA (linha única). */
function img(pixels: number[][]): ImageData {
  const data = new Uint8ClampedArray(pixels.flat());
  return makeImageData(data, pixels.length, 1);
}

describe('posterize (por valor / preserva matiz)', () => {
  it('quantiza o BRILHO: cinza escuro → preto, cinza claro → branco (levels 2)', () => {
    const out = posterize(img([[100, 100, 100, 255], [200, 200, 200, 128]]), 2);
    expect([out.data[0], out.data[1], out.data[2]]).toEqual([0, 0, 0]);
    expect([out.data[4], out.data[5], out.data[6]]).toEqual([255, 255, 255]);
  });

  it('preserva o MATIZ ao reescalar (200,100,50) levels 3 → (255,127,64)', () => {
    const out = posterize(img([[200, 100, 50, 255]]), 3);
    expect([out.data[0], out.data[1], out.data[2]]).toEqual([255, 127, 64]);
  });

  it('preserva o alpha original', () => {
    const out = posterize(img([[100, 100, 100, 255], [200, 200, 200, 128]]), 2);
    expect(out.data[3]).toBe(255);
    expect(out.data[7]).toBe(128);
  });

  it('pixel preto (v=0) permanece preto sem divisão por zero', () => {
    const out = posterize(img([[0, 0, 0, 255]]), 4);
    expect([out.data[0], out.data[1], out.data[2], out.data[3]]).toEqual([0, 0, 0, 255]);
  });

  it('é DETERMINÍSTICO (duas execuções → pixels idênticos)', () => {
    const src = img([[10, 90, 170, 255], [40, 120, 210, 200]]);
    const a = posterize(src, 4);
    const b = posterize(src, 4);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('mais níveis preservam mais degraus intermediários de brilho', () => {
    const src = img([[128, 128, 128, 255]]);
    const two = posterize(src, 2).data[0];
    const eight = posterize(src, 8).data[0];
    expect(two === 0 || two === 255).toBe(true);
    expect(eight).toBeGreaterThan(0);
    expect(eight).toBeLessThan(255);
  });
});
