/** Modelo de botton no catálogo de seleção (extensível). */
export interface ModelOption {
  /** Chave estável usada na Edge Function (`shape_key`). */
  readonly key: string;
  /** Rótulo exibido ao usuário. */
  readonly label: string;
  /** `false` = card "em breve" (desabilitado). */
  readonly available: boolean;
}

/** Tamanho de botton disponível (mm). */
export interface SizeOption {
  /** Diâmetro nominal / face em milímetros. */
  readonly sizeMm: number;
  /** Rótulo curto (ex.: "32 mm"). */
  readonly label: string;
}
