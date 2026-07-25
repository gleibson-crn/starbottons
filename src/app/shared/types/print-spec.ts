/**
 * Espelha a tabela Postgres `print_specs` (ver ADR-003): parâmetros
 * geométricos por combinação modelo × tamanho de botton, lidos tanto pelo
 * Angular (preview) quanto pela Edge Function (arte final).
 *
 * Este é o contrato de tipo do bootstrap; o schema real vem das migrations
 * do backend-developer. Ajuste os campos conforme a migration definitiva.
 */
export interface PrintSpec {
  /** Identificador do modelo de botton (ex.: 'redondo'). */
  readonly model: string;
  /** Tamanho nominal em milímetros (ex.: 32, 44, 58). */
  readonly sizeMm: number;
  /** Sangria em milímetros. */
  readonly bleedMm: number;
  /** Área segura em milímetros. */
  readonly safeMm: number;
  /** Diâmetro visível (face / linha de corte) em milímetros. */
  readonly visibleMm: number;
  /**
   * Diâmetro TOTAL da arte com sangria, em mm (coluna `art_diameter_mm`).
   * Fonte da verdade do backend — usar direto (não derivar de visible+bleed).
   */
  readonly artDiameterMm: number;
  /** DPI alvo da arte (ver ADR-004, 300 no MVP). */
  readonly dpiTarget: number;
}
