import type { ModelOption, PrintSpec, SizeOption } from '../types';
import { DEFAULT_DPI } from './mm-px';

/**
 * Catálogo de modelos. Só 'round' está ativo no MVP; os demais entram como
 * cards "em breve" (layout extensível — basta virar `available: true`).
 */
export const MODEL_OPTIONS: readonly ModelOption[] = [
  { key: 'round', label: 'Redondo', available: true },
  { key: 'square', label: 'Quadrado', available: false },
  { key: 'star', label: 'Estrela', available: false },
  { key: 'heart', label: 'Coração', available: false },
];

/** Tamanhos suportados no MVP. */
export const SIZE_OPTIONS: readonly SizeOption[] = [
  { sizeMm: 32, label: '32 mm' },
  { sizeMm: 44, label: '44 mm' },
  { sizeMm: 58, label: '58 mm' },
];

/**
 * Specs geométricas de fallback (client-side) para bottons redondos.
 *
 * Fonte de verdade é a tabela Postgres `print_specs` (backend); estes valores
 * mantêm o editor funcional durante desenvolvimento paralelo e servem de
 * default caso a consulta falhe. `visibleMm` = face; `artDiameterMm` = arte com
 * sangria (32→44, 44→54, 58→70, conforme migration/Edge); segurança 2mm.
 */
const ROUND_SPECS: Readonly<Record<number, PrintSpec>> = {
  32: { model: 'round', sizeMm: 32, visibleMm: 32, artDiameterMm: 44, bleedMm: 6, safeMm: 2, dpiTarget: DEFAULT_DPI },
  44: { model: 'round', sizeMm: 44, visibleMm: 44, artDiameterMm: 54, bleedMm: 5, safeMm: 2, dpiTarget: DEFAULT_DPI },
  58: { model: 'round', sizeMm: 58, visibleMm: 58, artDiameterMm: 70, bleedMm: 6, safeMm: 2, dpiTarget: DEFAULT_DPI },
};

/** Retorna a spec de fallback para um tamanho, ou `null` se desconhecido. */
export function fallbackSpec(model: string, sizeMm: number): PrintSpec | null {
  if (model !== 'round') {
    return null;
  }
  return ROUND_SPECS[sizeMm] ?? null;
}
