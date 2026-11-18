import {
  DEFAULT_CUTOUT_THRESHOLD,
  KEEP_COMPONENT_RATIO,
  keepMainComponents,
  type RgbaBuffer,
} from './cutout-postprocess';

/** Monta um buffer RGBA a partir de uma grade de alfas (cor fixa). */
function fromAlpha(rows: number[][]): RgbaBuffer {
  const h = rows.length;
  const w = rows[0].length;
  const data = new Uint8ClampedArray(w * h * 4);
  rows.flat().forEach((a, p) => {
    data.set([10, 20, 30, a], p * 4);
  });
  return { data, width: w, height: h };
}

/** Alfa de cada pixel em grade. */
function alphaGrid(buf: RgbaBuffer): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < buf.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < buf.width; x++) {
      row.push(buf.data[(y * buf.width + x) * 4 + 3]);
    }
    out.push(row);
  }
  return out;
}

describe('keepMainComponents (pós-processamento do recorte)', () => {
  it('aplica o limiar: alfa abaixo vira 0, acima permanece', () => {
    const out = keepMainComponents(fromAlpha([[30, 255, 255, 255, 39]]), 40);
    expect(alphaGrid(out)[0]).toEqual([0, 255, 255, 255, 0]);
  });

  it('mantém dois componentes grandes (grupo de 2+ pessoas)', () => {
    const out = keepMainComponents(
      fromAlpha([[255, 255, 0, 255, 255, 255, 255]]),
      DEFAULT_CUTOUT_THRESHOLD,
    );
    // componentes: 2 px e 4 px → 2 ≥ 15% de 4 → ambos ficam.
    expect(alphaGrid(out)[0]).toEqual([255, 255, 0, 255, 255, 255, 255]);
  });

  it('descarta ilha pequena (< 15% do maior), ex.: reflexo', () => {
    const row = [...Array(20).fill(255), 0, 255];
    const out = keepMainComponents(fromAlpha([row]), DEFAULT_CUTOUT_THRESHOLD);
    // 20 px vs 1 px (5% < 15%) → a ilha de 1 px some.
    expect(alphaGrid(out)[0].slice(0, 20)).toEqual(Array(20).fill(255));
    expect(alphaGrid(out)[0][21]).toBe(0);
  });

  it('o limite é inclusivo: componente com exatamente 15% do maior fica', () => {
    // maior = 20 px; 15% = 3 px → ilha de 3 px é mantida.
    const row = [...Array(20).fill(255), 0, 255, 255, 255];
    const out = keepMainComponents(fromAlpha([row]), DEFAULT_CUTOUT_THRESHOLD);
    expect(KEEP_COMPONENT_RATIO).toBe(0.15);
    expect(alphaGrid(out)[0].slice(21)).toEqual([255, 255, 255]);
  });

  it('preserva o alfa original (borda suave) dentro do componente mantido', () => {
    const out = keepMainComponents(fromAlpha([[255, 200, 90, 41]]), 40);
    expect(alphaGrid(out)[0]).toEqual([255, 200, 90, 41]);
  });

  it('usa conectividade 4 (diagonal NÃO conecta)', () => {
    const out = keepMainComponents(
      fromAlpha([
        [255, 255, 255, 0],
        [255, 255, 255, 0],
        [255, 255, 255, 0],
        [0, 0, 0, 255],
      ]),
      40,
    );
    // pixel diagonal isolado (1 px de 9) = 11% < 15% → descartado.
    expect(alphaGrid(out)[3][3]).toBe(0);
    expect(alphaGrid(out)[0][0]).toBe(255);
  });

  it('não muta a entrada e preserva RGB', () => {
    const src = fromAlpha([[255, 0]]);
    const out = keepMainComponents(src, 40);
    expect(src.data[3]).toBe(255);
    expect(Array.from(out.data.slice(0, 3))).toEqual([10, 20, 30]);
  });

  it('sem nenhum pixel acima do limiar → tudo transparente', () => {
    const out = keepMainComponents(fromAlpha([[5, 10], [20, 39]]), 40);
    expect(alphaGrid(out)).toEqual([[0, 0], [0, 0]]);
  });
});
