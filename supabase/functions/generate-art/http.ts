/** Parsing/validação de request e helpers de resposta (JSON + CORS). */

import {
  ArtError,
  type ArtOptions,
  type Frame,
  type GenerateRequest,
} from "./types.ts";

/** Teto defensivo de molduras empilhadas (excedente é ignorado). */
const MAX_FRAMES = 3;

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

// Limites defensivos do enquadramento (arte/fundo/moldura) — evitam que um
// `scale`/`offset` gigante faça o ImageScript alocar um bitmap enorme e travar o
// worker (F-A). Valores folgados p/ o uso real (botton ≤70mm; zoom da UI é 1.08×).
const SCALE_MIN = 0.1;
const SCALE_MAX = 10;
const OFFSET_MAX_MM = 500;

/** Escala no intervalo seguro [0.1, 10] (default 1). */
function clampScale(value: unknown): number {
  return Math.min(Math.max(finiteOr(value, 1), SCALE_MIN), SCALE_MAX);
}

/** Offset MM clampado a |mm| ≤ 500 (default 0). */
function clampOffsetMm(value: unknown): number {
  return Math.min(Math.max(finiteOr(value, 0), -OFFSET_MAX_MM), OFFSET_MAX_MM);
}

/** Offset {x,y} em MM, sanitizado + clampado campo a campo (default {x:0,y:0}). */
function sanitizeOffset(
  raw: { x?: number; y?: number } | undefined,
): { x: number; y: number } {
  return { x: clampOffsetMm(raw?.x), y: clampOffsetMm(raw?.y) };
}

/**
 * Sanitiza UMA moldura (espelha offset/scale/rotation do fundo). Retorna null
 * quando `path` não é string não-vazia → o item é descartado silenciosamente.
 */
function sanitizeFrame(raw: unknown): Frame | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Partial<Frame>;
  if (typeof item.path !== "string" || !item.path) return null;
  return {
    path: item.path,
    offset: sanitizeOffset(item.offset),
    scale: clampScale(item.scale),
    rotation: finiteOr(item.rotation, 0),
  };
}

/**
 * Normaliza o array de molduras: descarta itens inválidos, clampa a ≤3 (ignora
 * o excedente). Ausente/não-array/vazio → [] (sem moldura, comportamento atual).
 */
function sanitizeFrames(raw: unknown): Frame[] {
  if (!Array.isArray(raw)) return [];
  const frames: Frame[] = [];
  for (const item of raw) {
    const frame = sanitizeFrame(item);
    if (frame) frames.push(frame);
    if (frames.length >= MAX_FRAMES) break; // clamp defensivo a ≤3
  }
  return frames;
}

/** Normaliza options com defaults seguros (fundo branco, sem transform). */
function normalizeOptions(raw: Partial<ArtOptions> | undefined): ArtOptions {
  return {
    fit: "cover",
    offset: sanitizeOffset(raw?.offset),
    scale: clampScale(raw?.scale),
    rotation: finiteOr(raw?.rotation, 0),
    // Espelhamento da arte (booleano estrito; ADR-022: todo campo novo é copiado aqui).
    flipH: raw?.flipH === true,
    flipV: raw?.flipV === true,
    background: typeof raw?.background === "string"
      ? raw.background
      : "#ffffff",
    backgroundImage: typeof raw?.backgroundImage === "string" &&
        raw.backgroundImage
      ? raw.backgroundImage
      : null,
    // Enquadramento do fundo (aditivo): mesma sanitização/clamp da arte.
    backgroundOffset: sanitizeOffset(raw?.backgroundOffset),
    backgroundScale: clampScale(raw?.backgroundScale),
    backgroundRotation: finiteOr(raw?.backgroundRotation, 0),
    // Molduras empilhadas (camadas de TOPO): array ≤3, cada uma com
    // enquadramento próprio (offset/scale/rotation). Ausente/vazio → [].
    frames: sanitizeFrames(raw?.frames),
    // Número na sangria (MVP só-dígitos, ≤8). Vazio → omitido.
    ...sanitizeSequenceLabel(raw?.sequenceLabel),
  };
}

const MAX_SEQUENCE_DIGITS = 8;

function sanitizeSequenceLabel(raw: unknown): { sequenceLabel?: string } {
  if (typeof raw !== "string") return {};
  const digits = raw.replace(/\D/g, "").slice(0, MAX_SEQUENCE_DIGITS);
  return digits ? { sequenceLabel: digits } : {};
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
