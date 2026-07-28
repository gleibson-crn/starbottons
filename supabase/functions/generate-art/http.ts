/** Parsing/validação de request e helpers de resposta (JSON + CORS). */

import { ArtError, type ArtOptions, type GenerateRequest } from "./types.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// F-007 (AUDIT-2026-07-25): job_id vira segmento de path no Storage (renders/{id}/...)
// e PK. Restringe ao formato UUID v4 canônico para barrar path traversal / injeção.
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resposta JSON já com CORS. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

/** Resposta ao preflight OPTIONS. */
export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Número finito ou fallback (descarta NaN/Infinity de payloads maliciosos). */
function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Offset {x,y} em MM, sanitizado campo a campo (default {x:0,y:0}). */
function sanitizeOffset(
  raw: { x?: number; y?: number } | undefined,
): { x: number; y: number } {
  return { x: finiteOr(raw?.x, 0), y: finiteOr(raw?.y, 0) };
}

/** Normaliza options com defaults seguros (fundo branco, sem transform). */
function normalizeOptions(raw: Partial<ArtOptions> | undefined): ArtOptions {
  return {
    fit: "cover",
    offset: sanitizeOffset(raw?.offset),
    scale: finiteOr(raw?.scale, 1),
    rotation: finiteOr(raw?.rotation, 0),
    background: typeof raw?.background === "string"
      ? raw.background
      : "#ffffff",
    backgroundImage: typeof raw?.backgroundImage === "string" &&
        raw.backgroundImage
      ? raw.backgroundImage
      : null,
    // Enquadramento do fundo (aditivo): mesma sanitização da arte.
    backgroundOffset: sanitizeOffset(raw?.backgroundOffset),
    backgroundScale: finiteOr(raw?.backgroundScale, 1),
    backgroundRotation: finiteOr(raw?.backgroundRotation, 0),
  };
}

/** Valida e tipa o corpo do POST; lança ArtError(400) em payload inválido. */
export async function parseRequest(request: Request): Promise<GenerateRequest> {
  let raw: Record<string, unknown>;
  try {
    raw = await request.json();
  } catch {
    throw new ArtError(400, "corpo JSON inválido");
  }
  const uploadId = raw.upload_id;
  const shapeKey = (raw.shape_key as string) ?? "round";
  const sizeMm = Number(raw.size_mm);
  if (typeof uploadId !== "string" || !uploadId) {
    throw new ArtError(400, "upload_id obrigatório");
  }
  if (!Number.isFinite(sizeMm) || sizeMm <= 0) {
    throw new ArtError(400, "size_mm inválido");
  }
  return {
    job_id: parseJobId(raw.job_id),
    upload_id: uploadId,
    shape_key: shapeKey,
    size_mm: sizeMm,
    options: normalizeOptions(raw.options as Partial<ArtOptions>),
  };
}

/**
 * Chave de idempotência: job_id (uuid v4) do corpo. Ausente → gera. Presente mas
 * fora do formato UUID v4 → 400 (F-007): impede path traversal via job_id do client.
 */
function parseJobId(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") {
    return crypto.randomUUID();
  }
  if (typeof raw !== "string" || !UUID_V4_RE.test(raw)) {
    throw new ArtError(400, "job_id inválido (esperado UUID v4)");
  }
  return raw;
}
