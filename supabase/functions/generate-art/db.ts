/**
 * Acesso a dados/Storage da Edge. Usa service_role internamente (bypassa RLS)
 * DEPOIS de validar o JWT do usuário — quem chama precisa estar autenticado.
 */

import { createClient, type SupabaseClient } from "./deps.ts";
import { ArtError, internalError, type PrintSpec } from "./types.ts";

const UPLOADS_BUCKET = "uploads";
const RENDERS_BUCKET = "renders";
// TTL de 4h (era 10min: expirava com o app aberto); a UI re-assina sob demanda.
// Signed URL é bearer de arquivo — mantenha a janela limitada.
const SIGNED_URL_TTL_SECONDS = 14400;

/** Cliente service_role para I/O interno. */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw internalError("config Supabase ausente");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Valida o Bearer token; lança 401 se ausente/ inválido. Retorna o user id. */
export async function requireUser(
  db: SupabaseClient,
  authHeader: string | null,
): Promise<string> {
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) throw new ArtError(401, "token ausente");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new ArtError(401, "token inválido");
  return data.user.id;
}

/** Carrega a print_spec de shape×tamanho; 422 se não existir/ inativa. */
export async function fetchSpec(
  db: SupabaseClient,
  shape: string,
  sizeMm: number,
): Promise<PrintSpec> {
  const { data, error } = await db
    .from("print_specs")
    .select("shape,visible_mm,art_diameter_mm,bleed_mm,safe_mm,dpi_target")
    .eq("shape", shape).eq("visible_mm", sizeMm).eq("is_active", true)
    .maybeSingle();
  if (error) throw internalError("leitura de spec falhou", error.message);
  if (!data) {
    throw new ArtError(422, `sem print_spec para ${shape} ${sizeMm}mm`);
  }
  return data as PrintSpec;
}

/** Metadados do upload; 404 se inexistente. Retorna storage_path. */
export async function fetchUploadPath(
  db: SupabaseClient,
  uploadId: string,
): Promise<string> {
  const { data, error } = await db
    .from("uploads").select("storage_path").eq("id", uploadId).maybeSingle();
  if (error) throw internalError("leitura de upload falhou", error.message);
  if (!data) throw new ArtError(404, "upload inexistente");
  return data.storage_path as string;
}

/** Baixa os bytes da origem do bucket privado uploads. */
export async function downloadSource(
  db: SupabaseClient,
  path: string,
): Promise<Uint8Array> {
  const { data, error } = await db.storage.from(UPLOADS_BUCKET).download(path);
  if (error || !data) {
    throw new ArtError(404, "arquivo de origem não encontrado");
  }
  return new Uint8Array(await data.arrayBuffer());
}

/** Sobe um artefato para renders/{jobId}/{name}. */
export async function uploadRender(
  db: SupabaseClient,
  jobId: string,
  name: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const path = `${jobId}/${name}`;
  const { error } = await db.storage.from(RENDERS_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw internalError("upload de render falhou", error.message);
  return path;
}

/** Gera signed URL para download privado do artefato. */
export async function signRender(
  db: SupabaseClient,
  path: string,
): Promise<string> {
  const { data, error } = await db.storage.from(RENDERS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    throw internalError("falha ao assinar URL", error?.message);
  }
  return data.signedUrl;
}
