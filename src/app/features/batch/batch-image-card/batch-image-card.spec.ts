/**
 * BatchImageCard — cada arte com status `failed` deve expor o TAMANHO que
 * falhou e o MOTIVO (errorMessage) de forma amigável, além do detalhe técnico
 * quando existir. A cor de erro nunca é a única pista (ícone ✕ + texto).
 */
import { TestBed } from '@angular/core/testing';
import { DEFAULT_FILTERS, DEFAULT_TRANSFORM } from '../../../shared/types';
import {
  IDLE_ART,
  type ArtState,
  type BatchItem,
  type BottonSize,
} from '../../../core/batch';
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
    ...overrides,
  };
}

function cardWith(item: BatchItem): BatchImageCard {
  const fixture = TestBed.createComponent(BatchImageCard);
  fixture.componentRef.setInput('item', item);
  return fixture.componentInstance;
}

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
