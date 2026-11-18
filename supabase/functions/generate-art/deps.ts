/**
 * Dependências externas centralizadas (pinadas por versão).
 *
 * Libs Deno/WASM do pipeline de arte (ADR-001/004):
 * - ImageScript: decodifica/transforma a origem PNG/JPEG (ADR-002; não lê WebP).
 * - resvg-wasm: rasteriza o SVG de layout → PNG na dpi_target.
 * - supabase-js: cliente com service_role para I/O em storage/tabelas.
 */

export { decode as decodeImage, Image } from "imagescript";

export { initWasm, Resvg } from "resvg-wasm";

export { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** URL do binário WASM do resvg (carregado sob demanda em raster.ts). */
export const RESVG_WASM_URL =
  "https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
