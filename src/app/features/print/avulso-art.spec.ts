/**
 * avulso-art — testes do renderizador client-side. Canvas/`toBlob`, `Image` e os
 * object URLs são stubados por GLOBAL (jsdom não rasteriza nem carrega blobs, e
 * o runner do Angular não suporta `vi.mock` de imports relativos). Verificamos o
 * artPx correto por tamanho, o object URL de saída e o fluxo `buildAvulsoLine`
 * (carrega o arquivo + revoga a prévia).
 */
import { buildAvulsoLine, renderAvulsoArt } from './avulso-art';

/** `Image` falso: dispara `onload` assim que a `src` é atribuída. */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = '';
  decoding = '';
  naturalWidth = 100;
  naturalHeight = 100;
  set src(_v: string) {
    queueMicrotask(() => this.onload?.());
  }
}

/** Canvas falso: ctx que aceita todas as chamadas + `toBlob` síncrono. */
function makeCanvas(): HTMLCanvasElement {
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    filter: 'none',
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    arc: () => undefined,
    clip: () => undefined,
    stroke: () => undefined,
    setLineDash: () => undefined,
    fillRect: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    drawImage: () => undefined,
  };
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: Blob | null) => void) =>
      cb(new Blob(['x'], { type: 'image/png' })),
  } as unknown as HTMLCanvasElement;
}

const IMG = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement;

describe('avulso-art', () => {
  let canvases: HTMLCanvasElement[];
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    canvases = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        const c = makeCanvas();
        canvases.push(c);
        return c;
      }
      return realCreate(tag as 'div');
    });
    vi.stubGlobal('Image', FakeImage);
    createObjectURL = vi.fn(() => 'blob:art');
    revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('dimensiona o canvas em artPx por tamanho (mmToPx do artDiameterMm)', async () => {
    const cases: [32 | 44 | 58, number][] = [
      [32, 520], // 44 mm @ 300 DPI
      [44, 638], // 54 mm @ 300 DPI
      [58, 827], // 70 mm @ 300 DPI
    ];
    for (const [size, artPx] of cases) {
      canvases = [];
      await renderAvulsoArt(IMG, size);
      expect(canvases[0].width).toBe(artPx);
      expect(canvases[0].height).toBe(artPx);
    }
  });

  it('retorna um object URL da arte gerada (via toBlob)', async () => {
    const url = await renderAvulsoArt(IMG, 44);
    expect(url).toBe('blob:art');
    expect(createObjectURL).toHaveBeenCalledOnce();
  });

  it('buildAvulsoLine devolve uma SheetLine avulsa e revoga a prévia do arquivo', async () => {
    createObjectURL.mockReturnValueOnce('blob:file').mockReturnValueOnce('blob:art');
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    const line = await buildAvulsoLine(file, 58, 3);
    expect(line.origin).toBe('avulso');
    expect(line.sizeMm).toBe(58);
    expect(line.name).toBe('logo.png');
    expect(line.quantity).toBe(3);
    expect(line.url).toBe('blob:art');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:file');
  });
});
