/**
 * POST /functions/v1/style-transfer — proxy server-side de style transfer por IA
 * (ADR-021). A chave do provedor vive SÓ no servidor.
 *
 * Fluxo: valida JWT (401) → parseia payload (400) → decodifica base64 e confere
 * assinatura/tamanho da imagem (400/422) → resolve o estilo (400) → escolhe o
 * provider (503 se feature off) → aplica dentro do orçamento de tempo (502 em
 * falha do provedor) → 200 com a imagem estilizada.
 *
 * Precedência de provider (provider.selectProvider): STYLE_TRANSFER_MOCK=1 → mock;
 * senão GEMINI_API_KEY ausente → 503; senão Gemini real.
 */

import { requireUser, serviceClient } from "./db.ts";
import { json, parseRequest, preflight } from "./http.ts";
import { assertSafeSource } from "./image-header.ts";
import { resolveStyle } from "./styles.ts";
import { requireProvider, runRestyle } from "./provider.ts";
import { decodeBase64, encodeBase64 } from "./deps.ts";
import { StyleError, styleErrorBody, type StyleResponse } from "./types.ts";

/** Decodifica o base64 do payload; base64 malformado → 400. */
function decodeImage(image_base64: string): Uint8Array {
  try {
    return decodeBase64(image_base64);
  } catch {
    throw new StyleError(400, "image_base64 não é base64 válido");
  }
}

/** Handler principal já em contexto de POST. */
async function handleStyleTransfer(request: Request): Promise<Response> {
  const db = serviceClient();
  const userId = await requireUser(db, request.headers.get("authorization"));
  const req = await parseRequest(request);
  const bytes = decodeImage(req.image_base64);
  const source = assertSafeSource(bytes); // 400 assinatura / 422 >24MP
  const style = resolveStyle(req.style_id, req.strength); // 400 id desconhecido
  const provider = requireProvider(); // 503 se feature off
  const out = await runRestyle(
    provider,
    {
      bytes,
      mime: source.mime,
      prompt: style.prompt,
      strength: style.strength,
      fidelity: style.fidelity,
    },
    { userId, styleId: req.style_id },
  );
  const body: StyleResponse = {
    image_base64: encodeBase64(out.bytes),
    mime_type: out.mime,
    provider: provider.id,
    model: provider.model,
    cost_estimate_usd: out.costEstimateUsd,
  };
  return json(body, 200);
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }
  try {
    return await handleStyleTransfer(request);
  } catch (err) {
    // StyleError SEMPRE carrega mensagem segura (inclusive 502/503) → devolve tal
    // qual. Qualquer outra exceção é interna: loga e responde 500 genérico.
    if (err instanceof StyleError) {
      // `code` (quando presente) é seguro e estável → client pode tratar (ex.:
      // "insufficient_credits" no 402). Sem code, mantém só { error }.
      return json(styleErrorBody(err), err.status);
    }
    console.error("[style-transfer] erro não tratado:", err);
    return json({ error: "internal error" }, 500);
  }
});
