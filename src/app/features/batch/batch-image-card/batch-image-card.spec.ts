/**
 * BatchImageCard — cada arte com status `failed` deve expor o TAMANHO que
 * falhou e o MOTIVO (errorMessage) de forma amigável, além do detalhe técnico
 * quando existir. A cor de erro nunca é a única pista (ícone ✕ + texto).
 */
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { DEFAULT_FILTERS, DEFAULT_TRANSFORM } from '../../../shared/types';
import {
  IDLE_ART,
  type ArtState,
  type BatchItem,
  type BottonSize,
} from '../../../core/batch';
import { PrintStore } from '../../../core/print';
import { GenerationService } from '../../../core/generation/generation.service';
import { BatchImageCard } from './batch-image-card';

function art(patch: Partial<ArtState>): ArtState {
  return { ...IDLE_ART, ...patch };
}

function makeItem(overrides: Partial<BatchItem> = {}): BatchItem {
  const zero: Record<BottonSize, number> = { 32: 300, 44: 300, 58: 300 };
  return {
    id: 'i1',
    name: 'Minha Arte',
    upload: { id: 'up1', path: 'p', fileName: 'a.png', width: 2000, height: 2000, previewUrl: 'x' },
    fileName: 'a.png',
    previewUrl: 'x',
    width: 2000,
    height: 2000,
    transform: DEFAULT_TRANSFORM,
    editorSide: 512,
    filters: DEFAULT_FILTERS,
    generationUpload: null,
    selectedSizes: new Set<BottonSize>([32, 44, 58]),
    perSizeDpi: zero,
    perSizeTier: { 32: 'ok', 44: 'ok', 58: 'ok' },
    arts: {},
    uploadError: null,
    seqLabel: '',
    ...overrides,
  };
}

function cardWith(item: BatchItem): BatchImageCard {
  const fixture = TestBed.createComponent(BatchImageCard);
  fixture.componentRef.setInput('item', item);
  return fixture.componentInstance;
}

const freshPrintUrl = vi.fn<(jobId: string | null) => Promise<string | null>>();

beforeEach(() => {
  freshPrintUrl.mockReset();
  freshPrintUrl.mockResolvedValue(null);
  TestBed.configureTestingModule({
    providers: [{ provide: GenerationService, useValue: { freshPrintUrl } }],
  });
});

describe('BatchImageCard — reenvio quando o upload falha', () => {
  /** Botão "Reenviar" renderizado, ou undefined. (upload null → corpo não renderiza). */
  function retryButton(
    fx: ComponentFixture<BatchImageCard>,
  ): HTMLButtonElement | undefined {
    const buttons = Array.from(
      (fx.nativeElement as HTMLElement).querySelectorAll('button'),
    ) as HTMLButtonElement[];
    return buttons.find((b) => b.textContent?.trim() === 'Reenviar');
  }

  it('upload falhou → mostra "Reenviar" e emite uploadRetried ao clicar', () => {
    const fx = TestBed.createComponent(BatchImageCard);
    fx.componentRef.setInput(
      'item',
      makeItem({ upload: null, uploadError: 'JWT issued at future' }),
    );
    fx.detectChanges();

    const btn = retryButton(fx);
    expect(btn).toBeTruthy();
    let emitted = false;
    fx.componentInstance.uploadRetried.subscribe(() => (emitted = true));
    btn!.click();
    expect(emitted).toBe(true);
  });

  it('ainda enviando (sem erro) → NÃO mostra "Reenviar"', () => {
    const fx = TestBed.createComponent(BatchImageCard);
    fx.componentRef.setInput('item', makeItem({ upload: null, uploadError: null }));
    fx.detectChanges();
    expect(retryButton(fx)).toBeFalsy();
  });
});

describe('BatchImageCard — falhas por arte', () => {
  it('lista tamanho + resumo amigável + detalhe técnico da arte falha', () => {
    const item = makeItem({
      arts: {
        58: art({ status: 'failed', errorMessage: 'internal error' }),
        32: art({ status: 'ready', printPngUrl: 'png' }),
      },
    });
    const cmp = cardWith(item);

    const failures = cmp.failures();
    expect(failures.length).toBe(1);
    expect(failures[0].size).toBe(58);
    expect(failures[0].summary).toBe('58 mm: falha ao gerar. Tente novamente.');
    expect(failures[0].detail).toBe('internal error');
  });

  it('sem errorMessage → detail null (só o resumo amigável)', () => {
    const item = makeItem({
      arts: { 44: art({ status: 'failed', errorMessage: null }) },
    });
    const cmp = cardWith(item);

    expect(cmp.failures()).toEqual([
      { size: 44, summary: '44 mm: falha ao gerar. Tente novamente.', detail: null },
    ]);
  });

  it('sem falhas → lista vazia e status não-failed', () => {
    const item = makeItem({
      arts: { 32: art({ status: 'ready', printPngUrl: 'png' }) },
      selectedSizes: new Set<BottonSize>([32]),
    });
    const cmp = cardWith(item);

    expect(cmp.failures()).toEqual([]);
  });
});

describe('BatchImageCard — Aplicar em cenário', () => {
  it('habilita quando há ≥1 arte pronta', () => {
    const cmp = cardWith(makeItem({ arts: { 44: art({ status: 'ready', printPngUrl: 'png' }) } }));
    expect(cmp.canApplyScene()).toBe(true);
  });

  it('permanece desabilitado sem nenhuma arte pronta (idle/falha)', () => {
    const cmp = cardWith(
      makeItem({ arts: { 44: art({ status: 'failed' }), 58: art({ status: 'generating' }) } }),
    );
    expect(cmp.canApplyScene()).toBe(false);
  });

  it('emite applyScene ao acionar', () => {
    const cmp = cardWith(makeItem({ arts: { 32: art({ status: 'ready', printPngUrl: 'png' }) } }));
    const spy = vi.fn();
    cmp.applyScene.subscribe(spy);
    cmp.applyScene.emit();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('BatchImageCard — Levar para impressão', () => {
  beforeEach(() => {
    // A arte do lote (signed URL) é baixada e convertida em object URL local.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/png' }) })),
    );
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:print');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('só há artes prontas (downloads) quando há status ready — condição do botão', () => {
    const semReady = cardWith(makeItem({ arts: { 44: art({ status: 'generating' }) } }));
    expect(semReady.downloads()).toHaveLength(0);
    const comReady = cardWith(
      makeItem({ arts: { 44: art({ status: 'ready', printPngUrl: 'png' }) } }),
    );
    expect(comReady.downloads().length).toBeGreaterThan(0);
  });

  it('adiciona uma linha por tamanho pronto à folha SEM navegar', async () => {
    const item = makeItem({
      arts: {
        32: art({ status: 'ready', printPngUrl: 'blob:a32' }),
        58: art({ status: 'ready', printPngUrl: 'blob:a58' }),
      },
      selectedSizes: new Set<BottonSize>([32, 58]),
    });
    const cmp = cardWith(item);
    const store = TestBed.inject(PrintStore);

    await cmp.addToPrint();

    expect(store.queue().map((l) => l.key)).toEqual(['i1:32', 'i1:58']);
    expect(store.queue().every((l) => l.url === 'blob:print' && l.origin === 'ready')).toBe(true);
    expect(cmp.inPrint()).toBe(true);
  });

  it('não duplica a arte já adicionada (2º clique é no-op)', async () => {
    const item = makeItem({
      arts: { 44: art({ status: 'ready', printPngUrl: 'blob:a44' }) },
      selectedSizes: new Set<BottonSize>([44]),
    });
    const cmp = cardWith(item);
    const store = TestBed.inject(PrintStore);

    await cmp.addToPrint();
    await cmp.addToPrint();

    expect(store.queue()).toHaveLength(1);
    expect(store.queue()[0].quantity).toBe(1);
  });

  it('removeFromPrint tira as artes deste item da folha', async () => {
    const item = makeItem({
      arts: { 44: art({ status: 'ready', printPngUrl: 'blob:a44' }) },
      selectedSizes: new Set<BottonSize>([44]),
    });
    const cmp = cardWith(item);
    const store = TestBed.inject(PrintStore);
    await cmp.addToPrint();
    expect(cmp.inPrint()).toBe(true);

    cmp.removeFromPrint();

    expect(store.queue()).toHaveLength(0);
    expect(cmp.inPrint()).toBe(false);
  });

  it('usa a URL FRESH (re-assinada) em vez da guardada quando freshPrintUrl resolve', async () => {
    freshPrintUrl.mockResolvedValue('https://fresh/print.png');
    const item = makeItem({
      arts: { 44: art({ status: 'ready', printPngUrl: 'https://old/print.png', jobId: 'j44' }) },
      selectedSizes: new Set<BottonSize>([44]),
    });
    const cmp = cardWith(item);

    await cmp.addToPrint();

    expect(freshPrintUrl).toHaveBeenCalledWith('j44');
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://fresh/print.png');
  });

  it('cai na URL guardada quando freshPrintUrl devolve null', async () => {
    const item = makeItem({
      arts: { 44: art({ status: 'ready', printPngUrl: 'https://old/print.png', jobId: 'j44' }) },
      selectedSizes: new Set<BottonSize>([44]),
    });
    const cmp = cardWith(item);

    await cmp.addToPrint();

    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://old/print.png');
  });

  it('não adiciona quando o fetch da arte falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    const item = makeItem({
      arts: { 44: art({ status: 'ready', printPngUrl: 'blob:a44' }) },
      selectedSizes: new Set<BottonSize>([44]),
    });
    const cmp = cardWith(item);
    const store = TestBed.inject(PrintStore);

    await cmp.addToPrint();

    expect(store.queue()).toHaveLength(0);
    expect(cmp.inPrint()).toBe(false);
  });
});

describe('BatchImageCard — número (senha) manual', () => {
  function render(numbered: boolean, duplicate = false): HTMLElement {
    const fx = TestBed.createComponent(BatchImageCard);
    fx.componentRef.setInput('item', makeItem({ seqLabel: '7' }));
    fx.componentRef.setInput('numbered', numbered);
    fx.componentRef.setInput('duplicate', duplicate);
    fx.detectChanges();
    return fx.nativeElement as HTMLElement;
  }

  it('numbered → input numérico rotulado com o valor', () => {
    const el = render(true);
    const input = el.querySelector<HTMLInputElement>('.bcard__seq input');
    expect(input?.value).toBe('7');
    expect(input?.getAttribute('inputmode')).toBe('numeric');
    expect(el.querySelector('.bcard__seq label')?.textContent).toContain('Número (senha)');
  });

  it('digitar emite seqChanged', () => {
    const fx = TestBed.createComponent(BatchImageCard);
    fx.componentRef.setInput('item', makeItem());
    fx.componentRef.setInput('numbered', true);
    fx.detectChanges();
    const emitted: string[] = [];
    fx.componentInstance.seqChanged.subscribe((v) => emitted.push(v));
    const input = (fx.nativeElement as HTMLElement).querySelector<HTMLInputElement>('.bcard__seq input')!;
    input.value = '55';
    input.dispatchEvent(new Event('input'));
    expect(emitted).toEqual(['55']);
  });

  it('duplicado → estado de alerta com aria-invalid e aviso', () => {
    const el = render(true, true);
    expect(el.querySelector('.bcard__seq--dup')).not.toBeNull();
    expect(el.querySelector('.bcard__seq input')?.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('.bcard__seq-hint')?.textContent).toContain('repetido');
  });

  it('não numerado → sem campo', () => {
    expect(render(false).querySelector('.bcard__seq')).toBeNull();
  });
});

describe('BatchImageCard — prévia no card', () => {
  it('sem facePreview, a prévia usa a foto original', () => {
    const card = cardWith(makeItem({ previewUrl: 'orig' }));
    expect(card.previewSrc()).toBe('orig');
    expect(card.hasAdjustedPreview()).toBe(false);
  });

  it('com facePreview, a prévia usa a face composta', () => {
    const card = cardWith(makeItem({ previewUrl: 'orig', facePreview: 'data:img' }));
    expect(card.previewSrc()).toBe('data:img');
    expect(card.hasAdjustedPreview()).toBe(true);
  });
});
