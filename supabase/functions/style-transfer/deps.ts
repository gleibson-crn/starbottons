/**
 * Dependências externas centralizadas (pinadas por versão).
 *
 * - supabase-js: cliente com service_role só para validar o JWT (auth.getUser).
 * - std/encoding/base64: encode/decode do payload de imagem (sem prefixo data:).
 */

export { createClient, type SupabaseClient } from "@supabase/supabase-js";

export { decodeBase64, encodeBase64 } from "@std/encoding/base64";
