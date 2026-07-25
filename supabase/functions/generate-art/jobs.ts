/** Ciclo de vida de generation_jobs e persistência de assets. */

import { type SupabaseClient } from "./deps.ts";
import {
  type ArtLayout,
  type GenerateRequest,
  internalError,
} from "./types.ts";

/**
 * Cria/atualiza o job de forma IDEMPOTENTE, usando o job_id do client como PK.
 * Um retry com o mesmo job_id reaproveita a linha (UPSERT) em vez de duplicar.
 * Devolve o id efetivo.
 */
export async function upsertProcessingJob(
  db: SupabaseClient,
  userId: string,
  req: GenerateRequest,
): Promise<string> {
  const { data, error } = await db.from("generation_jobs").upsert({
    id: req.job_id,
    upload_id: req.upload_id,
    shape: req.shape_key,
    size_mm: req.size_mm,
    status: "processing",
    params: req.options ?? {},
    requested_by: userId,
    started_at: new Date().toISOString(),
    error_message: null,
    finished_at: null,
  }, { onConflict: "id" }).select("id").single();
  if (error || !data) {
    throw internalError("upsert de job falhou", error?.message);
  }
  return data.id as string;
}

/** Marca o job como concluído. */
export async function markJobDone(
  db: SupabaseClient,
  jobId: string,
): Promise<void> {
  await db.from("generation_jobs")
    .update({ status: "done", finished_at: new Date().toISOString() })
    .eq("id", jobId);
}

/** Marca o job como erro, gravando a mensagem para diagnóstico/polling. */
export async function markJobError(
  db: SupabaseClient,
  jobId: string,
  message: string,
): Promise<void> {
  await db.from("generation_jobs")
    .update({
      status: "error",
      error_message: message,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

/** Registra um asset gerado. */
export async function insertAsset(
  db: SupabaseClient,
  jobId: string,
  kind: string,
  path: string,
  mime: string,
  bytes: number,
  layout: ArtLayout,
): Promise<void> {
  const { error } = await db.from("assets").insert({
    job_id: jobId,
    kind,
    storage_path: path,
    mime,
    bytes,
    width_px: layout.artPx,
    height_px: layout.artPx,
    dpi: layout.dpi,
  });
  if (error) throw internalError("insert de asset falhou", error.message);
}
