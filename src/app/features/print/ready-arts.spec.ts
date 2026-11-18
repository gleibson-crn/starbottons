import { DEFAULT_FILTERS, DEFAULT_TRANSFORM } from '../../shared/types';
import { IDLE_ART, type ArtState, type BatchItem, type BottonSize } from '../../core/batch';
import { collectReadyArts } from './ready-arts';

function art(patch: Partial<ArtState>): ArtState {
  return { ...IDLE_ART, ...patch };
}

function makeItem(
  id: string,
  name: string,
  sizes: BottonSize[],
  arts: BatchItem['arts'],
): BatchItem {
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
    selectedSizes: new Set<BottonSize>(sizes),
    perSizeDpi: dpi,
    perSizeTier: { 32: 'ok', 44: 'ok', 58: 'ok' },
    arts,
    uploadError: null,
    seqLabel: '',
  };
}

describe('collectReadyArts', () => {
  it('retorna vazio sem itens', () => {
    expect(collectReadyArts([])).toEqual([]);
  });

  it('inclui só artes ready com printPngUrl', () => {
    const item = makeItem('a', 'Logo', [32, 44, 58], {
      32: art({ status: 'ready', printPngUrl: 'blob:32' }),
      44: art({ status: 'failed' }),
      58: art({ status: 'ready', printPngUrl: null }),
    });
    const ready = collectReadyArts([item]);
    expect(ready).toHaveLength(1);
    expect(ready[0]).toMatchObject({ key: 'a:32', sizeMm: 32, url: 'blob:32', name: 'Logo' });
  });

  it('ignora tamanho ready que não está mais selecionado', () => {
    const item = makeItem('a', 'Logo', [44], {
      32: art({ status: 'ready', printPngUrl: 'blob:32' }),
    });
    expect(collectReadyArts([item])).toEqual([]);
  });

  it('mantém ordem canônica: por item e tamanho crescente', () => {
    const a = makeItem('a', 'A', [32, 58], {
      32: art({ status: 'ready', printPngUrl: 'blob:a32' }),
      58: art({ status: 'ready', printPngUrl: 'blob:a58' }),
    });
    const b = makeItem('b', 'B', [44], {
      44: art({ status: 'ready', printPngUrl: 'blob:b44' }),
    });
    const keys = collectReadyArts([a, b]).map((r) => r.key);
    expect(keys).toEqual(['a:32', 'a:58', 'b:44']);
  });
});
