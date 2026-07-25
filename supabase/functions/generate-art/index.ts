/**
 * POST /functions/v1/generate-art — gera a arte de impressão do botton.
 *
 * Fluxo (ADR-001/003/004/005): valida JWT → carrega print_spec (422 se não
 * existir) → cria job=processing → pipeline de render → assets + job=done (200).
 * Se o render exceder o orçamento de tempo, responde 202 e conclui em segundo
 * plano (EdgeRuntime.waitUntil); o client faz polling em generation_jobs (ADR-005).
 */

import { fetchSpec, requireUser, serviceClient } from "./db.ts";
import { markJobDone, markJobError, upsertProcessingJob } from "./jobs.ts";
import { generateArtwork } from "./render.ts";
import { json, parseRequest, preflight } from "./http.ts";
import { ArtError, type AssetResult } from "./types.ts";
import { type SupabaseClient } from "./deps.ts";

/** Orçamento de tempo síncrono antes de degradar para 202 (ADR-005). */
const TIME_BUDGET_MS = 25_000;
const TIMED_OUT = Symbol("timed-out");

// Global do runtime Supabase para trabalho em segundo plano.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/** Executa o pipeline e reconcilia o status do job (done/error). */
function runJob(
  db: SupabaseClient,
  jobId: string,
  spec: unknown,
  req: unknown,
): Promise<AssetResult[]> {
  // deno-lint-ignore no-explicit-any
  return generateArtwork(db, jobId, spec as any, req as any)
    .then(async (assets) => {
      await markJobDone(db, jobId);
      return assets;
    })
    .catch(async (err) => {
      await markJobError(db, jobId, err?.message ?? "erro de render");
      throw err;
    });
}

/** Corre o job contra o orçamento; devolve assets ou TIMED_OUT. */
async function raceBudget(
  work: Promise<AssetResult[]>,
): Promise<AssetResult[] | typeof TIMED_OUT> {
  const timer = new Promise<typeof TIMED_OUT>((resolve) =>
    setTimeout(() => resolve(TIMED_OUT), TIME_BUDGET_MS)
  );
  return await Promise.race([work, timer]);
}

/** Handler principal já autenticado e com payload validado. */
async function handleGenerate(request: Request): Promise<Response> {
  const db = serviceClient();
  const userId = await requireUser(db, request.headers.get("authorization"));
  const req = await parseRequest(request);
  const spec = await fetchSpec(db, req.shape_key, req.size_mm);
  const jobId = await upsertProcessingJob(db, userId, req);
  const work = runJob(db, jobId, spec, req);
  const outcome = await raceBudget(work);
  if (outcome === TIMED_OUT) {
    EdgeRuntime?.waitUntil(work.catch(() => {}));
    return json({ job_id: jobId, status: "processing" }, 202);
  }
  return json({ job_id: jobId, status: "done", assets: outcome }, 200);
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }
  try {
    return await handleGenerate(request);
  } catch (err) {
    // F-004: nunca vaza detalhe interno em 5xx; só mensagens de validação 4xx.
    if (err instanceof ArtError && err.status < 500) {
      return json({ error: err.message }, err.status);
    }
    if (!(err instanceof ArtError)) {
      console.error("[generate-art] erro não tratado:", err);
    }
    return json({ error: "internal error" }, 500);
  }
});
