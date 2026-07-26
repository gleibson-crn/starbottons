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

const source = { naturalWidth: 2000, naturalHeight: 1500 } as unknown as
  CanvasImageSource & FilterSource;

describe('renderFilteredBlob', () => {
  it('desenha em resolução NATURAL com o filterString aplicado', async () => {
    const ctx = makeCtx();
    const canvas = fakeCanvas(ctx, new Blob(['png'], { type: 'image/png' }));

    const blob = await renderFilteredBlob(source, VIVID, () => canvas);

    expect(canvas.width).toBe(2000);
    expect(canvas.height).toBe(1500);
    expect(ctx.filter).toBe('brightness(1) contrast(1.15) saturate(1.4)');
    expect(ctx.drawArgs).toEqual([source, 0, 0]);
    expect(blob.type).toBe('image/png');
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
