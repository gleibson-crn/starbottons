import type { PrintSpec, ResolutionTier } from '../types';

const MM_PER_INCH = 25.4;

/** Limiares do semáforo de resolução (DPI efetivo). */
export const DPI_OK = 300;
export const DPI_MIN = 150;

/**
 * Diâmetro total da arte (com sangria), em mm — vem direto de `print_specs`
 * (`art_diameter_mm`). É a medida física usada no cálculo de DPI efetivo.
 */
export function artDiameterMm(spec: PrintSpec): number {
  return spec.artDiameterMm;
}

/** Diâmetro da zona de segurança (face − 2mm de cada lado), em mm. */
export function safeDiameterMm(spec: PrintSpec): number {
  return spec.visibleMm - 2 * spec.safeMm;
}

/**
 * Quantidade de pixels de origem que cobrem o diâmetro da arte.
 *
 * Em fit "cover" a 1×, o menor lado da imagem cobre o diâmetro; ao ampliar
 * (scale > 1) menos pixels de origem cobrem a mesma área → menor densidade.
 */
export function sourcePxCoveringArt(
  naturalMinSide: number,
  scale: number,
): number {
  const s = scale > 0 ? scale : 1;
  return naturalMinSide / s;
}

/**
 * DPI efetivo = pixels de origem cobrindo a arte ÷ (diâmetro_arte_mm / 25.4).
 * Recalculável em <1ms — chamado a cada gesto do editor.
 */
export function effectiveDpi(params: {
  naturalWidth: number;
  naturalHeight: number;
  scale: number;
  spec: PrintSpec;
}): number {
  const minSide = Math.min(params.naturalWidth, params.naturalHeight);
  if (minSide <= 0) {
    return 0;
  }
  const covering = sourcePxCoveringArt(minSide, params.scale);
  const artInches = artDiameterMm(params.spec) / MM_PER_INCH;
  return artInches > 0 ? covering / artInches : 0;
}

/**
 * Classifica o DPI efetivo nas três faixas do semáforo:
 * 🟢 ≥300 ótima · 🟡 150–299 baixa · 🔴 <150 muito baixa.
 *
 * NOTA (política de gating): nenhuma faixa BLOQUEIA a geração. O 🔴 é um
 * aviso forte ("pode sair borrado — sob responsabilidade do usuário"), não uma
 * trava — o usuário pode marcar o tamanho mesmo assim. O nome interno da faixa
 * segue 'blocked' por compatibilidade, mas hoje significa apenas "risco alto".
 */
export function resolutionTier(dpi: number): ResolutionTier {
  if (dpi >= DPI_OK) {
    return 'ok';
  }
  if (dpi >= DPI_MIN) {
    return 'warn';
  }
  return 'blocked';
}
