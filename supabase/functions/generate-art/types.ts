/** Contratos de tipo da Edge Function generate-art. */

/** Linha da tabela print_specs (ADR-003). */
export interface PrintSpec {
  readonly id?: number;
  readonly shape: string;
  readonly visible_mm: number;
  readonly art_diameter_mm: number;
  readonly bleed_mm: number;
  readonly safe_mm: number;
  readonly dpi_target: number;
}

/** Geometria derivada em px/pt para uma spec (ver geometry.computeLayout). */
export interface ArtLayout {
  readonly dpi: number;
  readonly artPx: number;
  readonly visiblePx: number;
  readonly bleedPx: number;
  readonly safePx: number;
  readonly artCenter: number;
  readonly visibleRadiusPx: number;
  readonly safeRadiusPx: number;
  readonly artWidthPt: number;
  readonly artHeightPt: number;
}

/** Ajustes de enquadramento vindos do client. */
export interface ArtOptions {
  readonly fit: "cover";
  readonly offset: { x: number; y: number };
  readonly scale: number;
  readonly rotation: number;
  readonly background: string;
  /**
   * Camada opcional de IMAGEM de fundo (path no bucket 'uploads') composta SOB a
   * arte do usuário — para bottons com cena/foto de fundo. `background` (cor)
   * segue como base/fallback. Ausente/null/vazio → só a cor (comportamento atual).
   */
  readonly backgroundImage?: string | null;
  /**
   * Enquadramento do FUNDO (espelha offset/scale/rotation da arte). Aplicados
   * SÓ quando há `backgroundImage`. Todos opcionais com defaults ({x:0,y:0}/1/0)
   * → ausência reproduz o cover fixo/centrado anterior.
   */
  readonly backgroundOffset?: { x: number; y: number }; // MM (default {x:0,y:0})
  readonly backgroundScale?: number; // default 1
  readonly backgroundRotation?: number; // default 0
}

/** Corpo esperado no POST /generate-art. */
export interface GenerateRequest {
  /** UUID gerado no client; PK idempotente do job. Gerado aqui se ausente. */
  readonly job_id: string;
  readonly upload_id: string;
  readonly shape_key: string;
  readonly size_mm: number;
  readonly options: ArtOptions;
}

/** Descritor de asset devolvido ao client. */
export interface AssetResult {
  readonly kind: string;
  readonly signed_url: string;
  readonly width_px: number;
  readonly height_px: number;
  readonly dpi: number;
}

/** Erro de domínio com status HTTP associado. */
export class ArtError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ArtError";
  }
}

/**
 * F-004 (AUDIT-2026-07-25): erro interno. Loga o detalhe (Postgres/Storage) no
 * servidor para auditoria, mas devolve ao client uma mensagem GENÉRICA — nunca
 * o texto cru do erro (evita vazar schema/infra).
 */
export function internalError(context: string, detail?: unknown): ArtError {
  console.error(`[generate-art] ${context}:`, detail);
  return new ArtError(500, "internal error");
}
