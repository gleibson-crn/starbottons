import type { ImageFilters } from './editor';
import {
  DEFAULT_FILTERS,
  filterString,
  filtersEqual,
  isDefaultFilters,
} from './editor';

const CUSTOM = (over: Partial<ImageFilters>): ImageFilters => ({
  ...DEFAULT_FILTERS,
  ...over,
});

describe('image-filters', () => {
  it('DEFAULT_FILTERS é o estado neutro', () => {
    expect(DEFAULT_FILTERS).toEqual({
      brightness: 1,
      contrast: 1,
      saturate: 1,
      effect: 'none',
    });
    expect(isDefaultFilters(DEFAULT_FILTERS)).toBe(true);
  });

  it('filterString retorna vazio no estado default (nenhum filtro)', () => {
    expect(filterString(DEFAULT_FILTERS)).toBe('');
    expect(filterString({ ...DEFAULT_FILTERS })).toBe('');
  });

  it('filterString compõe brightness/contrast/saturate em ordem estável', () => {
    expect(filterString(CUSTOM({ brightness: 1.2 }))).toBe(
      'brightness(1.2) contrast(1) saturate(1)',
    );
    expect(filterString(CUSTOM({ contrast: 1.15, saturate: 1.4 }))).toBe(
      'brightness(1) contrast(1.15) saturate(1.4)',
    );
  });

  it('filterString anexa o efeito exclusivo por último', () => {
    expect(filterString(CUSTOM({ effect: 'grayscale' }))).toBe(
      'brightness(1) contrast(1) saturate(1) grayscale(1)',
    );
    expect(filterString(CUSTOM({ effect: 'sepia' }))).toBe(
      'brightness(1) contrast(1) saturate(1) sepia(1)',
    );
  });

  it('filterString combina fatores e efeito na MESMA ordem', () => {
    expect(
      filterString({
        brightness: 1.1,
        contrast: 1.05,
        saturate: 0.9,
        effect: 'sepia',
      }),
    ).toBe('brightness(1.1) contrast(1.05) saturate(0.9) sepia(1)');
  });

  it('filtersEqual compara todos os campos', () => {
    expect(filtersEqual(DEFAULT_FILTERS, { ...DEFAULT_FILTERS })).toBe(true);
    expect(filtersEqual(DEFAULT_FILTERS, CUSTOM({ brightness: 1.05 }))).toBe(
      false,
    );
    expect(filtersEqual(DEFAULT_FILTERS, CUSTOM({ effect: 'sepia' }))).toBe(
      false,
    );
  });
});
