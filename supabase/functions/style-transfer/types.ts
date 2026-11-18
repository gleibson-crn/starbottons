/** Contratos de tipo da Edge Function style-transfer (ADR-021). */

/** Corpo esperado no POST /style-transfer. */
export interface StyleRequest {
  /** Base64 puro da imagem (SEM prefixo `data:`). */
  readonly image_base64: string;
  readonly mime_type: "image/png" | "image/jpeg";
  readonly style_id: string;
  /** Intensidade do estilo (0..1). Default 0.6; clamp em styles.ts. */
  readonly strength: number;
}

/** Resposta 200 do POST /style-transfer. */
export interface StyleResponse {
  readonly image_base64: string;
  readonly mime_type: "image/png" | "image/jpeg";
  readonly provider: string;
  readonly model: string;
  readonly cost_estimate_usd?: number;
}

/**
 * Erro de domínio com status HTTP associado. TODA mensagem carregada aqui é
 * SEGURA para o client (sem stack/infra/chave) — o handler devolve `message`
 * tal qual, inclusive nos 5xx curados (502/503).
 *
 * `code` (opcional) é um identificador ESTÁVEL e seguro que o client pode tratar
 * programaticamente (ex.: "insufficient_credits" no 402 de falta de créditos do
 * provedor de IA). Default undefined → serialização mantém só `{ error }`.
 */
export class StyleError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "StyleError";
  }
}

/**
 * Corpo JSON seguro para devolver ao client a partir de um StyleError. Inclui
 * `code` só quando presente → mantém `{ error }` puro para os casos sem code.
 */
export function styleErrorBody(
  err: StyleError,
): { error: string; code?: string } {
  return err.code
    ? { error: err.message, code: err.code }
    : { error: err.message };
}

/**
 * Erro interno: loga o detalhe cru no servidor (auditoria) e devolve ao client
 * uma mensagem GENÉRICA — nunca o texto original (evita vazar schema/infra).
 */
export function internalError(context: string, detail?: unknown): StyleError {
  console.error(`[style-transfer] ${context}:`, detail);
  return new StyleError(500, "internal error");
}
