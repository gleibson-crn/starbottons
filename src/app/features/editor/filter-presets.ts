import type { ImageFilters } from '../../shared/types';
import { DEFAULT_FILTERS, filtersEqual } from '../../shared/types';

/** Id estável de cada preset (também usado como chave do chip). */
export type PresetId = 'original' | 'grayscale' | 'sepia' | 'vivid';

/** Chip de tratamento: rótulo + assinatura completa de filtros. */
export interface FilterPreset {
  readonly id: PresetId;
  readonly label: string;
  readonly filters: ImageFilters;
}

/**
 * Presets de "1 clique". Cada um define a assinatura COMPLETA de filtros
 * (seleção única). O "Vívido" combina saturação 140% + contraste 115% + brilho
 * 100% (sem efeito exclusivo).
 */
export const FILTER_PRESETS: readonly FilterPreset[] = [
  { id: 'original', label: 'Original', filters: DEFAULT_FILTERS },
  {
    id: 'grayscale',
    label: 'Preto & Branco',
    filters: { brightness: 1, contrast: 1, saturate: 1, effect: 'grayscale' },
  },
  {
    id: 'sepia',
    label: 'Sépia',
    filters: { brightness: 1, contrast: 1, saturate: 1, effect: 'sepia' },
  },
  {
    id: 'vivid',
    label: 'Vívido',
    filters: { brightness: 1, contrast: 1.15, saturate: 1.4, effect: 'none' },
  },
];

/**
 * Retorna o id do preset cuja assinatura bate EXATAMENTE com `f`, ou `null`
 * quando o usuário saiu da assinatura (estado "Personalizado").
 */
export function activePresetId(f: ImageFilters): PresetId | null {
  return FILTER_PRESETS.find((p) => filtersEqual(p.filters, f))?.id ?? null;
}
