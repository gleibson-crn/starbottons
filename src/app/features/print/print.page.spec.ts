/**
 * PrintPage — testes de comportamento: lê as artes prontas do BatchStore
 * (stubado), adiciona/edita/remove linhas e monta a prévia via `packSheet`.
 * `window.print` é espiado (jsdom não implementa impressão).
 */
import { TestBed } from '@angular/core/testing';
import { DEFAULT_FILTERS, DEFAULT_TRANSFORM } from '../../shared/types';
import { IDLE_ART, BatchStore, type ArtState, type BatchItem, type BottonSize } from '../../core/batch';
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
    providers: [{ provide: BatchStore, useValue: { items: () => items } }],
  });
  return TestBed.createComponent(PrintPage).componentInstance;
}

/** Evento sintético de `<input type="number">` com o valor dado. */
function qtyEvent(value: number): Event {
  return { target: { valueAsNumber: value } } as unknown as Event;
}

const READY = { 44: art({ status: 'ready', printPngUrl: 'blob:a44' }) };

describe('PrintPage', () => {
  it('expõe as artes prontas do lote', () => {
    const cmp = build([makeItem('a', 'Logo', READY)]);
    expect(cmp.readyArts().map((r) => r.key)).toEqual(['a:44']);
  });

  it('adiciona uma arte à folha e monta a prévia', () => {
    const cmp = build([makeItem('a', 'Logo', READY)]);
    cmp.addToSheet(cmp.readyArts()[0]);
    expect(cmp.lines()).toHaveLength(1);
    expect(cmp.hasSheet()).toBe(true);
    expect(cmp.packed().totalPieces).toBe(1);
  });

  it('usa a quantidade de rascunho ao adicionar', () => {
    const cmp = build([makeItem('a', 'Logo', READY)]);
    cmp.onDraftInput('a:44', qtyEvent(5));
    cmp.addToSheet(cmp.readyArts()[0]);
    expect(cmp.lines()[0].quantity).toBe(5);
    expect(cmp.packed().totalPieces).toBe(5);
  });

  it('soma a quantidade quando a mesma arte é adicionada de novo', () => {
    const cmp = build([makeItem('a', 'Logo', READY)]);
    const readyArt = cmp.readyArts()[0];
    cmp.addToSheet(readyArt);
    cmp.addToSheet(readyArt);
    expect(cmp.lines()).toHaveLength(1);
    expect(cmp.lines()[0].quantity).toBe(2);
  });

  it('edita e remove a quantidade de uma linha', () => {
    const cmp = build([makeItem('a', 'Logo', READY)]);
    cmp.addToSheet(cmp.readyArts()[0]);
    cmp.setLineQty('a:44', qtyEvent(9));
    expect(cmp.lines()[0].quantity).toBe(9);
    cmp.removeLine('a:44');
    expect(cmp.lines()).toHaveLength(0);
    expect(cmp.hasSheet()).toBe(false);
  });

  it('mistura tamanhos e reporta páginas/aproveitamento', () => {
    const cmp = build([
      makeItem('a', 'Logo', { 58: art({ status: 'ready', printPngUrl: 'blob:a58' }) }),
      makeItem('b', 'Selo', { 32: art({ status: 'ready', printPngUrl: 'blob:b32' }) }),
    ]);
    for (const readyArt of cmp.readyArts()) {
      cmp.onDraftInput(readyArt.key, qtyEvent(10));
      cmp.addToSheet(readyArt);
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
