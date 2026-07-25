/**
 * Conversões de unidades para a "matemática de layout compartilhada"
 * (ver ADR-001 / ADR-003). Estas fórmulas precisam ser idênticas entre o
 * preview no Angular e a arte final na Edge Function — por isso vivem num
 * util isolado e coberto por testes.
 *
 * Referência: 1 polegada = 25.4 mm; 1 polegada tipográfica = 72 pt.
 */

/** DPI padrão da arte no MVP (RGB 300 DPI — ver ADR-004). */
export const DEFAULT_DPI = 300;

/** Milímetros por polegada. */
const MM_PER_INCH = 25.4;

/** Pontos tipográficos por polegada. */
const PT_PER_INCH = 72;

/**
 * Converte milímetros para pixels num dado DPI, arredondando para o
 * inteiro mais próximo (pixels são discretos).
 *
 * @param mm  medida em milímetros
 * @param dpi resolução alvo em dots-per-inch (default 300)
 * @returns número inteiro de pixels
 */
export function mmToPx(mm: number, dpi: number = DEFAULT_DPI): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

/**
 * Converte milímetros para pontos tipográficos (unidade do PDF).
 * Não arredonda: o PDF trabalha com coordenadas fracionárias.
 *
 * @param mm medida em milímetros
 * @returns medida em pontos (pt)
 */
export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * PT_PER_INCH;
}
