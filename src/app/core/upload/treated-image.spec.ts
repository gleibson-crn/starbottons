import type { ImageFilters } from '../../shared/types';
import { DEFAULT_FILTERS } from '../../shared/types';
import {
  renderFilteredBlob,
  treatedFileName,
  type FilterSource,
} from './treated-image';

const VIVID: ImageFilters = {
  brightness: 1,
  contrast: 1.15,
  saturate: 1.4,
  effect: 'none',
};

interface FakeCtx {
  filter: string;
  drawArgs: unknown[];
  drawImage: (...a: unknown[]) => void;
}

function fakeCanvas(ctx: FakeCtx, blob: Blob | null): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    getContext: () => (ctx as unknown as CanvasRenderingContext2D) ?? null,
    toBlob: (cb: (b: Blob | null) => void) => cb(blob),
  } as unknown as HTMLCanvasElement;
}

function makeCtx(): FakeCtx {
  const ctx: FakeCtx = {
    filter: '',
    drawArgs: [],
    drawImage: (...a: unknown[]) => void (ctx.drawArgs = a),
  };
  return ctx;
}

const source = { naturalWidth: 1000, naturalHeight: 750 } as unknown as
  CanvasImageSource & FilterSource;

describe('renderFilteredBlob', () => {
  it('desenha até o teto de resolução com o filterString aplicado', async () => {
    const ctx = makeCtx();
    const canvas = fakeCanvas(ctx, new Blob(['png'], { type: 'image/png' }));

    // 1000×750 está abaixo do teto (1280) → resolução preservada.
    const blob = await renderFilteredBlob(source, VIVID, () => canvas);

    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(750);
    expect(ctx.filter).toBe('brightness(1) contrast(1.15) saturate(1.4)');
    expect(ctx.drawArgs).toEqual([source, 0, 0, 1000, 750]);
    expect(blob.type).toBe('image/png');
  });

  it('LIMITA o lado maior a 1280 (evita 24MP → CPU 546 e halftone embolado)', async () => {
    const ctx = makeCtx();
    const canvas = fakeCanvas(ctx, new Blob(['png'], { type: 'image/png' }));
    // Foto grande (4000×6000 = 24MP), como a que estourava a Edge.
    const big = { naturalWidth: 4000, naturalHeight: 6000 } as unknown as
      CanvasImageSource & FilterSource;

    await renderFilteredBlob(big, VIVID, () => canvas);

    // Lado maior (6000) cai para 1280; o menor escala proporcionalmente.
    expect(canvas.height).toBe(1280);
    expect(canvas.width).toBe(Math.round(4000 * (1280 / 6000)));
    expect(ctx.drawArgs).toEqual([big, 0, 0, canvas.width, canvas.height]);
  });

  it('rejeita quando toBlob não produz um blob', async () => {
    const ctx = makeCtx();
    const canvas = fakeCanvas(ctx, null);
    await expect(
      renderFilteredBlob(source, VIVID, () => canvas),
    ).rejects.toThrow(/PNG tratado/);
  });

  it('aplica string vazia quando os filtros são default', async () => {
    const ctx = makeCtx();
    const canvas = fakeCanvas(ctx, new Blob(['x'], { type: 'image/png' }));
    await renderFilteredBlob(source, DEFAULT_FILTERS, () => canvas);
    expect(ctx.filter).toBe('');
  });
});

describe('treatedFileName', () => {
  it('troca a extensão por -tratado.png', () => {
    expect(treatedFileName('foto.jpg')).toBe('foto-tratado.png');
    expect(treatedFileName('sem-extensao')).toBe('sem-extensao-tratado.png');
  });
});
