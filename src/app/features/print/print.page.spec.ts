/**
 * PrintPage — testes de comportamento. A folha agora vem da FILA da PrintStore
 * (não mais do BatchStore): começa VAZIA e recebe artes só via `enqueue`.
 * A página monta a prévia via `packSheet`, edita/remove linhas (delegando à
 * store) e imprime. `window.print` é espiado (jsdom não imprime).
 */
import { TestBed } from '@angular/core/testing';
import { PrintStore, type SheetLine } from '../../core/print';
import { PrintPage } from './print.page';

function readyLine(patch: Partial<SheetLine> = {}): SheetLine {
  return {
    key: 'a:44',
    url: 'blob:a44',
    name: 'Logo',
    sizeMm: 44,
    quantity: 1,
    origin: 'ready',
    ...patch,
  };
}

function build(): { cmp: PrintPage; store: PrintStore } {
  TestBed.configureTestingModule({});
  const store = TestBed.inject(PrintStore);
  const cmp = TestBed.createComponent(PrintPage).componentInstance;
  return { cmp, store };
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

describe('PrintPage — fila da PrintStore', () => {
  beforeEach(() => {
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('começa com a folha VAZIA (fila vazia por padrão)', () => {
    const { cmp } = build();
    expect(cmp.lines()).toEqual([]);
    expect(cmp.hasSheet()).toBe(false);
    expect(cmp.packed().totalPieces).toBe(0);
  });

  it('monta a prévia a partir das artes enfileiradas', () => {
    const { cmp, store } = build();
    store.enqueue(readyLine());
    expect(cmp.lines()).toHaveLength(1);
    expect(cmp.lines()[0].url).toBe('blob:a44');
    expect(cmp.hasSheet()).toBe(true);
    expect(cmp.packed().totalPieces).toBe(1);
  });

  it('soma a quantidade quando a mesma arte é enfileirada de novo', () => {
    const { cmp, store } = build();
    store.enqueue(readyLine({ quantity: 2 }));
    store.enqueue(readyLine({ url: 'blob:dup', quantity: 3 }));
    expect(cmp.lines()).toHaveLength(1);
    expect(cmp.lines()[0].quantity).toBe(5);
  });

  it('edita e remove a quantidade de uma linha', () => {
    const { cmp, store } = build();
    store.enqueue(readyLine());
    cmp.setLineQty('a:44', qtyEvent(9));
    expect(cmp.lines()[0].quantity).toBe(9);
    cmp.removeLine('a:44');
    expect(cmp.lines()).toHaveLength(0);
    expect(cmp.hasSheet()).toBe(false);
  });

  it('mistura tamanhos e reporta páginas/aproveitamento', () => {
    const { cmp, store } = build();
    store.enqueue(readyLine({ key: 'a:58', url: 'blob:a58', sizeMm: 58, quantity: 10 }));
    store.enqueue(readyLine({ key: 'b:32', url: 'blob:b32', sizeMm: 32, quantity: 10 }));
    expect(cmp.packed().totalPieces).toBe(20);
    expect(cmp.pageCount()).toBeGreaterThanOrEqual(1);
    expect(cmp.packed().utilizationPct).toBeGreaterThan(0);
  });

  it('chama window.print ao imprimir', () => {
    const spy = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const { cmp } = build();
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
    const { cmp } = build();
    cmp.onAvulsoFile(file());
    expect(cmp.hasPending()).toBe(true);
    expect(cmp.pendingFile()?.name).toBe('logo.png');
    expect(cmp.pendingPreview()).toBe('blob:preview');
    expect(createObjectURL).toHaveBeenCalledOnce();
  });

  it('enfileira a arte avulsa com o tamanho/quantidade escolhidos', async () => {
    createObjectURL.mockReturnValueOnce('blob:preview');
    const { cmp } = build();
    cmp.setAvulsoSize(selectEvent('58'));
    cmp.onAvulsoQtyInput(qtyEvent(3));
    cmp.onAvulsoFile(file());
    await cmp.addAvulsoToSheet();
    expect(cmp.lines()).toHaveLength(1);
    expect(cmp.lines()[0].origin).toBe('avulso');
    expect(cmp.lines()[0].sizeMm).toBe(58);
    expect(cmp.lines()[0].name).toBe('logo.png');
    expect(cmp.packed().totalPieces).toBe(3);
    // Após enfileirar, o pendente é limpo e a prévia revogada.
    expect(cmp.hasPending()).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('remove a arte avulsa revogando o object URL da arte (via store)', async () => {
    const { cmp } = build();
    cmp.onAvulsoFile(file());
    await cmp.addAvulsoToSheet();
    const line = cmp.lines()[0];
    cmp.removeLine(line.key);
    expect(cmp.lines()).toHaveLength(0);
    expect(revokeObjectURL).toHaveBeenCalledWith(line.url);
  });

  it('ngOnDestroy revoga só a prévia pendente (a fila persiste na store)', () => {
    createObjectURL.mockReturnValueOnce('blob:preview');
    const { cmp } = build();
    cmp.onAvulsoFile(file());
    cmp.ngOnDestroy();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('reporta erro quando a renderização avulsa falha', async () => {
    const { cmp } = build();
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
