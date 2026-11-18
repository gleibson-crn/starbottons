import type { ImageFilters } from '../../types';
import { DEFAULT_FILTERS, filtersEqual } from '../../types';

/** Id estável de cada preset (também usado como chave do chip). */
export type PresetId = 'original' | 'grayscale' | 'sepia' | 'vivid';

/**
 * Chip de tratamento TONAL: rótulo + assinatura dos filtros. Selecionar um chip
 * define os filtros tonais, então há um único preset ativo por vez. (Os antigos
 * estilos por pixel foram removidos da UI; o pipeline segue inerte no código.)
 */
export interface FilterPreset {
  readonly id: PresetId;
  readonly label: string;
  readonly filters: ImageFilters;
}

/**
 * Presets TONAIS de "1 clique" (CSS-puro). O "Vívido" combina saturação 140% +
 * contraste 115% + brilho 100% (sem efeito exclusivo).
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

/** Todos os presets, na ordem de exibição (só tonais). */
export const ALL_PRESETS: readonly FilterPreset[] = [...FILTER_PRESETS];

/**
 * Retorna o id do preset cuja assinatura tonal bate EXATAMENTE com `f`, ou
 * `null` quando o usuário saiu da assinatura (estado "Personalizado").
 */
export function activePresetId(f: ImageFilters): PresetId | null {
  const hit = ALL_PRESETS.find((p) => filtersEqual(p.filters, f));
  return hit?.id ?? null;
}
