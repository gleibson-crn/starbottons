import { DEFAULT_FILTERS, DEFAULT_TRANSFORM } from '../../shared/types';
import { hasReadyArt, largestReadySize } from './batch-gating';
import { IDLE_ART, type ArtState, type BatchItem, type BottonSize } from './batch.types';

function art(patch: Partial<ArtState>): ArtState {
  return { ...IDLE_ART, ...patch };
}

function makeItem(arts: BatchItem['arts']): BatchItem {
  const dpi: Record<BottonSize, number> = { 32: 300, 44: 300, 58: 300 };
  return {
    id: 'i1',
    name: 'Arte',
    upload: null,
    fileName: 'a.png',
    previewUrl: 'x',
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

describe('hasReadyArt', () => {
  it('true quando ao menos um tamanho tem arte pronta', () => {
    expect(hasReadyArt(makeItem({ 44: art({ status: 'ready' }) }))).toBe(true);
  });

  it('false quando nenhuma arte está pronta', () => {
    expect(hasReadyArt(makeItem({ 32: art({ status: 'failed' }), 58: art({ status: 'generating' }) }))).toBe(false);
  });

  it('false para item nulo/indefinido', () => {
    expect(hasReadyArt(null)).toBe(false);
    expect(hasReadyArt(undefined)).toBe(false);
  });
});

describe('largestReadySize', () => {
  it('retorna o MAIOR tamanho com arte pronta', () => {
    const item = makeItem({
      32: art({ status: 'ready' }),
      44: art({ status: 'ready' }),
      58: art({ status: 'failed' }),
    });
    expect(largestReadySize(item)).toBe(44);
  });

  it('null quando nenhuma arte está pronta', () => {
    expect(largestReadySize(makeItem({ 58: art({ status: 'idle' }) }))).toBeNull();
  });
});
