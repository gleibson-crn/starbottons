/** Parsing/validação de request e helpers de resposta (JSON + CORS). */

import { StyleError, type StyleRequest } from "./types.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

/** Valida o mime_type declarado (o magic-byte real é conferido depois). */
function parseMime(raw: unknown): "image/png" | "image/jpeg" {
  if (raw === "image/png" || raw === "image/jpeg") return raw;
  throw new StyleError(400, "mime_type inválido (só image/png ou image/jpeg)");
}

/** Valida e tipa o corpo do POST; lança StyleError(400) em payload inválido. */
export async function parseRequest(request: Request): Promise<StyleRequest> {
  let raw: Record<string, unknown>;
  try {
    raw = await request.json();
  } catch {
    throw new StyleError(400, "corpo JSON inválido");
  }
  const image = raw.image_base64;
  const styleId = raw.style_id;
  if (typeof image !== "string" || !image) {
    throw new StyleError(400, "image_base64 obrigatório");
  }
  if (typeof styleId !== "string" || !styleId) {
    throw new StyleError(400, "style_id obrigatório");
  }
  return {
    image_base64: image,
    mime_type: parseMime(raw.mime_type),
    style_id: styleId,
    // clamp 0..1 e mapeamento para linguagem ocorrem em styles.resolveStyle.
    strength: finiteOr(raw.strength, 0.6),
  };
}
