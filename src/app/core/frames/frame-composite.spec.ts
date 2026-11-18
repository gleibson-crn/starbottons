import { vi } from 'vitest';
import { renderFramesComposite } from './frame-composite';

function img(w: number, h: number): HTMLImageElement {
  return { naturalWidth: w, naturalHeight: h } as HTMLImageElement;
}

describe('renderFramesComposite', () => {
  const ctx = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    clip: vi.fn(),
  };
  let canvas: { width: number; height: number; getContext: () => unknown; toBlob: unknown };

  beforeEach(() => {
    Object.values(ctx).forEach((f) => f.mockReset());
    canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob: (cb: (b: Blob | null) => void, type: string) => cb(new Blob(['x'], { type })),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLElement);
  });
  afterEach(() => vi.restoreAllMocks());

  it('canvas side×side, transparente (clearRect, sem fill/clip), PNG', async () => {
    const blob = await renderFramesComposite([img(500, 500)], [
      { offset: { x: 0, y: 0 }, scale: 1, rotation: 0 },
    ]);
    expect(canvas.width).toBe(1000);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1000, 1000);
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.clip).not.toHaveBeenCalled();
    expect(blob.type).toBe('image/png');
  });

  it('COVER + offset (fração×side) + scale + rotação, na ordem do array', async () => {
    await renderFramesComposite(
      [img(200, 400), img(100, 100)],
      [
        { offset: { x: 0.1, y: -0.05 }, scale: 2, rotation: 90 },
        { offset: { x: 0, y: 0 }, scale: 1, rotation: 0 },
      ],
      1000,
    );
    expect(ctx.translate).toHaveBeenNthCalledWith(1, 600, 450);
    expect(ctx.rotate).toHaveBeenNthCalledWith(1, Math.PI / 2);
    // COVER: lado menor (200) → 1000 × scale 2 = 10×; 200→2000, 400→4000
    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, expect.anything(), -1000, -2000, 2000, 4000);
    expect(ctx.translate).toHaveBeenNthCalledWith(2, 500, 500);
  });

  it('diameterRatio amplia o offset (PNG cobre o círculo visível)', async () => {
    await renderFramesComposite(
      [img(100, 100)],
      [{ offset: { x: 0.1, y: 0 }, scale: 1, rotation: 0 }],
      1000,
      0.8,
    );
    expect(ctx.translate).toHaveBeenCalledWith(625, 500);
  });

  it('ignora camadas ainda não carregadas (null)', async () => {
    await renderFramesComposite([null], [{ offset: { x: 0, y: 0 }, scale: 1, rotation: 0 }]);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('rejeita quando toBlob devolve null', async () => {
    canvas.toBlob = (cb: (b: Blob | null) => void) => cb(null);
    await expect(renderFramesComposite([], [])).rejects.toThrow();
  });
});
