import { DEFAULT_FILTERS } from '../../types';
import { activePresetId, FILTER_PRESETS } from './filter-presets';

describe('filter-presets', () => {
  it('expõe os 4 chips na ordem Original → P&B → Sépia → Vívido', () => {
    expect(FILTER_PRESETS.map((p) => p.id)).toEqual([
      'original',
      'grayscale',
      'sepia',
      'vivid',
    ]);
  });

  it('o preset Vívido usa saturação 140% / contraste 115% / brilho 100%', () => {
    const vivid = FILTER_PRESETS.find((p) => p.id === 'vivid');
    expect(vivid?.filters).toEqual({
      brightness: 1,
      contrast: 1.15,
      saturate: 1.4,
      effect: 'none',
    });
  });

  it('activePresetId reconhece a assinatura exata de um preset', () => {
    expect(activePresetId(DEFAULT_FILTERS)).toBe('original');
    const vivid = FILTER_PRESETS.find((p) => p.id === 'vivid')!.filters;
    expect(activePresetId(vivid)).toBe('vivid');
  });

  it('activePresetId retorna null quando o usuário sai da assinatura (custom)', () => {
    const vivid = FILTER_PRESETS.find((p) => p.id === 'vivid')!.filters;
    expect(activePresetId({ ...vivid, brightness: 1.2 })).toBeNull();
  });
});
