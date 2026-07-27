import { DEFAULT_FILTERS, type ImageFilters, type UploadRecord } from '../../shared/types';
import {
  newUploadingItem,
  withFilters,
  withGenerationUpload,
} from './batch-item';

const VIVID: ImageFilters = {
  brightness: 1,
  contrast: 1.15,
  saturate: 1.4,
  effect: 'none',
};

const TREATED = { id: 'treated-1' } as UploadRecord;

function file(): File {
  return new File([new Uint8Array([1])], 'foto.png', { type: 'image/png' });
}

describe('batch-item — filtros', () => {
  it('novo item nasce com filtros neutros e sem upload tratado', () => {
    const item = newUploadingItem('i1', file());
    expect(item.filters).toEqual(DEFAULT_FILTERS);
    expect(item.generationUpload).toBeNull();
  });

  it('withFilters aplica os filtros de forma imutável', () => {
    const item = newUploadingItem('i1', file());
    const next = withFilters(item, VIVID);
    expect(next).not.toBe(item);
    expect(item.filters).toEqual(DEFAULT_FILTERS);
    expect(next.filters).toEqual(VIVID);
  });

  it('withFilters invalida o upload tratado em cache (fica stale)', () => {
    const base = withGenerationUpload(newUploadingItem('i1', file()), TREATED);
    expect(base.generationUpload).toBe(TREATED);

    const changed = withFilters(base, VIVID);
    expect(changed.generationUpload).toBeNull();
  });

  it('withGenerationUpload guarda o tratado sem mutar o item original', () => {
    const item = withFilters(newUploadingItem('i1', file()), VIVID);
    const next = withGenerationUpload(item, TREATED);
    expect(next).not.toBe(item);
    expect(item.generationUpload).toBeNull();
    expect(next.generationUpload).toBe(TREATED);
  });
});
