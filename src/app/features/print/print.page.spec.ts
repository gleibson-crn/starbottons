/**
 * PrintPage — testes de comportamento: lê as artes prontas do BatchStore
 * (stubado), adiciona/edita/remove linhas e monta a prévia via `packSheet`.
 * `window.print` é espiado (jsdom não implementa impressão).
 */
import { TestBed } from '@angular/core/testing';
import { DEFAULT_FILTERS, DEFAULT_TRANSFORM } from '../../shared/types';
import { IDLE_ART, BatchStore, type ArtState, type BatchItem, type BottonSize } from '../../core/batch';
import { ToastService } from '../../shared/ui';
import { PrintPage } from './print.page';

function art(patch: Partial<ArtState>): ArtState {
  return { ...IDLE_ART, ...patch };
}

function makeItem(id: string, name: string, arts: BatchItem['arts']): BatchItem {
  const dpi: Record<BottonSize, number> = { 32: 300, 44: 300, 58: 300 };
  return {
    id,
    name,
    upload: null,
    fileName: `${id}.png`,
    previewUrl: `blob:${id}`,
    width: 2000,
    height: 2000,
    transform: DEFAULT_TRANSFORM,
    editorSide: 512,
    filters: DEFAULT_FILTERS,
    generationUpload: null,
    selectedSizes: new Set<BottonSize>([32, 44, 58]),
    perSizeDpi: dpi,
    perSizeTier: { 32: 'ok', 44: 'ok', 58: 'ok' },
    arts,
    uploadError: null,
  };
}

function build(items: BatchItem[]): PrintPage {
  TestBed.configureTestingModule({
    providers: [
      { provide: BatchStore, useValue: { items: () => items } },
      {
        provide: ToastService,
        useValue: { error: () => undefined, success: () => undefined, warning: () => undefined, show: () => undefined },
      },
    ],
  });
  return TestBed.createComponent(PrintPage).componentInstance;
}

/** Evento sintético de `<input type="number">` com o valor dado. */
function qtyEvent(value: number): Event {
  return { target: { valueAsNumber: value } } as unknown as Event;
}

/** Evento sintético de `<select>` com o valor (string) dado. */
function selectEvent(value: string): Event {
  return { target: { value } } as unknown as Event;
}

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

/** Canvas falso: ctx no-op + `toBlob` síncrono (jsdom não rasteriza). */
function makeCanvas(): HTMLCanvasElement {
  const ctx = new Proxy(
    { fillStyle: '', strokeStyle: '', lineWidth: 0, filter: 'none' },
    { get: (t, k) => (k in t ? (t as Record<string, unknown>)[k as string] : () => undefined) },
  );
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['x'], { type: 'image/png' })),
  } as unknown as HTMLCanvasElement;
}

const READY = { 44: art({ status: 'ready', printPngUrl: 'blob:a44' }) };

describe('PrintPage', () => {
  beforeEach(() => {
    // addToSheet baixa a signed URL da arte e a converte em object URL local.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/png' }) })),
    );
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:ready');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('expõe as artes prontas do lote', () => {
    const cmp = build([makeItem('a', 'Logo', READY)]);
    expect(cmp.readyArts().map((r) => r.key)).toEqual(['a:44']);
  });

  it('adiciona uma arte à folha e monta a prévia', async () => {
    const cmp = build([makeItem('a', 'Logo', READY)]);
    await cmp.addToSheet(cmp.readyArts()[0]);
    expect(cmp.lines()).toHaveLength(1);
    expect(cmp.lines()[0].url).toBe('blob:ready');
    expect(cmp.hasSheet()).toBe(true);
    expect(cmp.packed().totalPieces).toBe(1);
  });

  it('usa a quantidade de rascunho ao adicionar', async () => {
    const cmp = build([makeItem('a', 'Logo', READY)]);
    cmp.onDraftInput('a:44', qtyEvent(5));
    await cmp.addToSheet(cmp.readyArts()[0]);
    expect(cmp.lines()[0].quantity).toBe(5);
    expect(cmp.packed().totalPieces).toBe(5);
  });

  it('soma a quantidade quando a mesma arte é adicionada de novo', async () => {
    const cmp = build([makeItem('a', 'Logo', READY)]);
    const readyArt = cmp.readyArts()[0];
    await cmp.addToSheet(readyArt);
    await cmp.addToSheet(readyArt);
    expect(cmp.lines()).toHaveLength(1);
    expect(cmp.lines()[0].quantity).toBe(2);
  });

  it('edita e remove a quantidade de uma linha', async () => {
    const cmp = build([makeItem('a', 'Logo', READY)]);
    await cmp.addToSheet(cmp.readyArts()[0]);
    cmp.setLineQty('a:44', qtyEvent(9));
    expect(cmp.lines()[0].quantity).toBe(9);
    cmp.removeLine('a:44');
    expect(cmp.lines()).toHaveLength(0);
    expect(cmp.hasSheet()).toBe(false);
  });

  it('mistura tamanhos e reporta páginas/aproveitamento', async () => {
    const cmp = build([
      makeItem('a', 'Logo', { 58: art({ status: 'ready', printPngUrl: 'blob:a58' }) }),
      makeItem('b', 'Selo', { 32: art({ status: 'ready', printPngUrl: 'blob:b32' }) }),
    ]);
    for (const readyArt of cmp.readyArts()) {
      cmp.onDraftInput(readyArt.key, qtyEvent(10));
      await cmp.addToSheet(readyArt);
    }
    expect(cmp.packed().totalPieces).toBe(20);
    expect(cmp.pageCount()).toBeGreaterThanOrEqual(1);
    expect(cmp.packed().utilizationPct).toBeGreaterThan(0);
  });

  it('chama window.print ao imprimir', () => {
    const spy = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const cmp = build([makeItem('a', 'Logo', READY)]);
    cmp.print();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

describe('PrintPage — imagem avulsa', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
      tag === 'canvas' ? makeCanvas() : realCreate(tag as 'div'),
    );
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

  function file(): File {
    return new File(['x'], 'logo.png', { type: 'image/png' });
  }

  it('segura o arquivo aceito e cria a prévia (object URL)', () => {
    createObjectURL.mockReturnValueOnce('blob:preview');
    const cmp = build([]);
    cmp.onAvulsoFile(file());
    expect(cmp.hasPending()).toBe(true);
    expect(cmp.pendingFile()?.name).toBe('logo.png');
    expect(cmp.pendingPreview()).toBe('blob:preview');
    expect(createObjectURL).toHaveBeenCalledOnce();
  });

  it('adiciona a arte avulsa à folha com o tamanho/quantidade escolhidos', async () => {
    createObjectURL.mockReturnValueOnce('blob:preview');
    const cmp = build([]);
    cmp.setAvulsoSize(selectEvent('58'));
    cmp.onAvulsoQtyInput(qtyEvent(3));
    cmp.onAvulsoFile(file());
    await cmp.addAvulsoToSheet();
    expect(cmp.lines()).toHaveLength(1);
    expect(cmp.lines()[0].origin).toBe('avulso');
    expect(cmp.lines()[0].sizeMm).toBe(58);
    expect(cmp.lines()[0].name).toBe('logo.png');
    expect(cmp.packed().totalPieces).toBe(3);
    // Após adicionar, o pendente é limpo e a prévia revogada.
    expect(cmp.hasPending()).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('remove a arte avulsa revogando o object URL da arte', async () => {
    const cmp = build([]);
    cmp.onAvulsoFile(file());
    await cmp.addAvulsoToSheet();
    const line = cmp.lines()[0];
    cmp.removeLine(line.key);
    expect(cmp.lines()).toHaveLength(0);
    expect(revokeObjectURL).toHaveBeenCalledWith(line.url);
  });

  it('ngOnDestroy revoga as artes avulsas restantes na folha', async () => {
    const cmp = build([]);
    cmp.onAvulsoFile(file());
    await cmp.addAvulsoToSheet();
    const line = cmp.lines()[0];
    cmp.ngOnDestroy();
    expect(revokeObjectURL).toHaveBeenCalledWith(line.url);
  });

  it('reporta erro quando a renderização avulsa falha', async () => {
    const cmp = build([]);
    cmp.onAvulsoFile(file());
    // Sem canvas 2D → buildAvulsoLine rejeita: getContext devolve null.
    vi.spyOn(document, 'createElement').mockImplementation(
      () =>
        ({
          width: 0,
          height: 0,
          getContext: () => null,
          toBlob: () => undefined,
        }) as unknown as HTMLCanvasElement,
    );
    await cmp.addAvulsoToSheet();
    expect(cmp.avulsoError()).not.toBeNull();
    expect(cmp.lines()).toHaveLength(0);
  });
});
