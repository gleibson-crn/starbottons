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

/** Normaliza options com defaults seguros (fundo branco, sem transform). */
function normalizeOptions(raw: Partial<ArtOptions> | undefined): ArtOptions {
  return {
    fit: "cover",
    offset: { x: raw?.offset?.x ?? 0, y: raw?.offset?.y ?? 0 },
    scale: typeof raw?.scale === "number" ? raw.scale : 1,
    rotation: typeof raw?.rotation === "number" ? raw.rotation : 0,
    background: typeof raw?.background === "string"
      ? raw.background
      : "#ffffff",
    backgroundImage: typeof raw?.backgroundImage === "string" &&
        raw.backgroundImage
      ? raw.backgroundImage
      : null,
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
