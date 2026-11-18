/**
 * Acesso ao Supabase só para AUTENTICAR. Espelha generate-art/db.ts: usa
 * service_role apenas para validar o Bearer (auth.getUser) — quem chama precisa
 * estar logado. Esta Edge não lê/escreve tabelas nem Storage.
 */

import { createClient, type SupabaseClient } from "./deps.ts";
import { internalError, StyleError } from "./types.ts";

/** Cliente service_role para validação de token. */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw internalError("config Supabase ausente");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Valida o Bearer token; lança 401 se ausente/inválido. Retorna o user id. */
export async function requireUser(
  db: SupabaseClient,
  authHeader: string | null,
): Promise<string> {
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) throw new StyleError(401, "token ausente");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new StyleError(401, "token inválido");
  return data.user.id;
}
