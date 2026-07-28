/**
 * MockupContextualPage — religada ao LOTE: lê o item por `:itemId` no
 * BatchStore, monta o sprite fiel (maior tamanho pronto) e, sem item/arte,
 * redireciona ao grid. O `Image` global é stubado (jsdom não carrega <img>, o
 * `loadImage` nunca resolveria) e o `getContext` é espiado (canvas não impl.).
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { DEFAULT_FILTERS, DEFAULT_TRANSFORM } from '../../shared/types';
import { BatchStore, IDLE_ART, type ArtState, type BatchItem, type BottonSize } from '../../core/batch';
import { ToastService } from '../../shared/ui';
import { ContextualTemplateService } from './contextual-template.service';
import { MockupContextualPage } from './mockup-contextual.page';

/** `Image` que dispara `onload` ao receber `src` (loadImage resolve na hora). */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = 'auto';
  crossOrigin: string | null = null;
  naturalWidth = 100;
  naturalHeight = 100;
  width = 100;
  height = 100;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

function mockCtx(): CanvasRenderingContext2D {
  const grad = { addColorStop: (): void => undefined };
  return {
    filter: 'none',
    fillStyle: '',
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    arc: () => undefined,
    clip: () => undefined,
    fillRect: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    drawImage: () => undefined,
    createRadialGradient: () => grad,
  } as unknown as CanvasRenderingContext2D;
}

function art(patch: Partial<ArtState>): ArtState {
  return { ...IDLE_ART, ...patch };
}

function makeItem(arts: BatchItem['arts']): BatchItem {
  const dpi: Record<BottonSize, number> = { 32: 300, 44: 300, 58: 300 };
  return {
    id: 'a',
    name: 'Arte',
    upload: null,
    fileName: 'a.png',
    previewUrl: 'blob:art',
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

function build(items: BatchItem[], itemId: string | null) {
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  const route = { snapshot: { paramMap: { get: () => itemId } } };
  TestBed.configureTestingModule({
    providers: [
      { provide: BatchStore, useValue: { items: () => items } },
      { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: route },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: ContextualTemplateService, useValue: {} },
    ],
  });
  const fixture = TestBed.createComponent(MockupContextualPage);
  return { cmp: fixture.componentInstance, router };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('MockupContextualPage — religada ao lote', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', FakeImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx() as unknown as ReturnType<HTMLCanvasElement['getContext']>,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('monta o sprite do item da rota (maior tamanho pronto) sem redirecionar', async () => {
    const { cmp, router } = build([makeItem({ 44: art({ status: 'ready' }) })], 'a');
    await flush();
    expect(cmp.sprite()).not.toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('redireciona a /app/batch quando o item da rota não existe', async () => {
    const { router } = build([], 'zzz');
    await flush();
    expect(router.navigate).toHaveBeenCalledWith(['/app/batch']);
  });

  it('redireciona quando o item existe mas não tem arte pronta', async () => {
    const { router } = build([makeItem({ 44: art({ status: 'failed' }) })], 'a');
    await flush();
    expect(router.navigate).toHaveBeenCalledWith(['/app/batch']);
  });
});
