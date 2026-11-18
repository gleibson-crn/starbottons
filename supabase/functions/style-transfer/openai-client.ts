/**
 * ÚNICO arquivo que conhece o "wire" da OpenAI. Trocar de provedor só toca aqui
 * + provider.selectProvider. Espelha a estrutura do gemini-client.ts.
 *
 * ── API confirmada (WebFetch — platform.openai.com/docs redireciona 301 para
 *    developers.openai.com/api/docs; consulta em 2026-07-31) ──────────────────
 * Guia   : https://developers.openai.com/api/docs/guides/image-generation
 * API ref: https://developers.openai.com/api/docs/api-reference/images/createEdit
 *
 *   Endpoint : POST https://api.openai.com/v1/images/edits   (multipart/form-data)
 *   Modelo   : env OPENAI_MODEL (default "gpt-image-1.5"). A doc lista como valores
 *              válidos "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini",
 *              "chatgpt-image-latest", "dall-e-2". Usamos gpt-image-1 (img2img,
 *              sempre devolve b64_json — sem response_format).
 *   Auth     : header `Authorization: Bearer <OPENAI_API_KEY>` (NUNCA logada).
 *   Campos   : image=<arquivo>, prompt=<texto>, model, n=1, size="auto",
 *              input_fidelity="high" (preserva rostos/feições da entrada).
 *   Response : { data: [ { b64_json: "<base64 da imagem>" } ], ... }
 *
 * Observação sobre `strength`: o endpoint de edição da OpenAI NÃO tem parâmetro
 * de intensidade. Como no Gemini, a intensidade já vem embutida no `prompt`
 * (styles.buildPrompt injeta subtle/moderate/strong) — não inventamos parâmetro.
 *
 * Nota de confiabilidade: a doc está atrás de Cloudflare (403 no host antigo) e o
 * sumarizador confundiu alguns campos entre a Edits API clássica e a Responses
 * API. Todo o "wire" concreto está ISOLADO aqui; se a forma real divergir, ajusta-se
 * buildForm/extractImage sem tocar no resto da Edge.
 */

import { decodeBase64 } from "./deps.ts";
import { StyleError } from "./types.ts";
import type {
  ImageStyleProvider,
  RestyleInput,
  RestyleOutput,
} from "./provider.ts";

const OPENAI_EDITS_URL = "https://api.openai.com/v1/images/edits";

/** Mensagem segura do 402 de falta de créditos (compartilhada com o Gemini). */
export const INSUFFICIENT_CREDITS_MSG =
  "É necessário inserir créditos na OpenAI para usar os filtros com IA.";

/**
 * Custo estimado por imagem de saída (gpt-image-1, ~1024px, qualidade padrão
 * ≈ US$0,04). Estimativa INFORMATIVA — varia com size/quality; não é faturamento.
 */
const COST_ESTIMATE_USD = 0.04;

/** Forma parcial da resposta que nos interessa. */
interface OpenAiImage {
  b64_json?: string;
}
interface OpenAiResponse {
  data?: OpenAiImage[];
}

/** Forma parcial do corpo de erro da OpenAI. */
interface OpenAiError {
  error?: { code?: string; type?: string };
}

/** Codes/type que a OpenAI usa para conta sem créditos / limite de billing. */
const CREDIT_CODES = new Set(["billing_hard_limit_reached", "insufficient_quota"]);
const CREDIT_TYPE = "billing_limit_user_error";

/** Codes de recusa por MODERAÇÃO/política de conteúdo (imagem ou prompt). */
const CONTENT_CODES = new Set([
  "content_policy_violation",
  "moderation_blocked",
  "image_generation_user_error",
]);
/** Mensagem segura para recusa por política de conteúdo. */
const CONTENT_MSG =
  "A imagem ou o estilo foi recusado pela política de conteúdo do provedor de " +
  "IA. Tente outra imagem ou outro estilo.";

/**
 * Traduz a resposta !ok da OpenAI em erro. NÃO vaza a mensagem crua (pode ecoar
 * request/prompt). Se o corpo indicar falta de créditos → StyleError(402,
 * "insufficient_credits"); qualquer outro caso → Error genérico só com status.
 */
async function toProviderError(res: Response): Promise<Error> {
  let body: OpenAiError = {};
  try {
    body = await res.json() as OpenAiError;
  } catch {
    // corpo não-JSON: cai no genérico com status
  }
  const code = body.error?.code;
  const type = body.error?.type;
  if ((code && CREDIT_CODES.has(code)) || type === CREDIT_TYPE) {
    return new StyleError(402, INSUFFICIENT_CREDITS_MSG, "insufficient_credits");
  }
  if ((code && CONTENT_CODES.has(code)) || (type && CONTENT_CODES.has(type))) {
    return new StyleError(422, CONTENT_MSG, "content_policy");
  }
  // 429 que NÃO é falta de crédito (já tratada acima) = rate limit temporário.
  if (res.status === 429) {
    return new StyleError(
      429,
      "Muitas requisições ao provedor de IA. Aguarde alguns segundos e tente novamente.",
      "rate_limited",
    );
  }
  return new Error(`OpenAI respondeu HTTP ${res.status}`);
}

/** Extensão de arquivo coerente com o mime de entrada (só p/ nomear o campo). */
function fileNameFor(mime: string): string {
  return mime === "image/jpeg" ? "source.jpg" : "source.png";
}

/** Monta o multipart/form-data do POST /images/edits. */
function buildForm(input: RestyleInput, model: string): FormData {
  const form = new FormData();
  // cast BlobPart: Uint8Array<ArrayBufferLike> não casa direto no lib.dom estrito.
  const blob = new Blob([input.bytes as BlobPart], { type: input.mime });
  form.append("image", blob, fileNameFor(input.mime));
  form.append("prompt", input.prompt);
  form.append("model", model);
  form.append("n", "1");
  form.append("size", "auto");
  // input_fidelity: POR ESTILO (styles.resolveStyle). "high" PRESERVA
  // rostos/feições/composição (estilos de pintura fiel); "low" dá liberdade ao
  // modelo para reinventar a cena (estilos de personagem, ex.: "Você Amarelo").
  // Default "high" quando não informado (comportamento seguro anterior).
  form.append("input_fidelity", input.fidelity ?? "high");
  return form;
}

/**
 * Extrai a imagem (b64_json) da resposta da OpenAI. FUNÇÃO PURA e testável —
 * não toca em rede. Lança se a resposta não trouxer imagem utilizável.
 * gpt-image-1 devolve sempre PNG.
 */
export function extractImage(json: OpenAiResponse): RestyleOutput {
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("resposta da OpenAI sem b64_json");
  return {
    bytes: decodeBase64(b64),
    mime: "image/png",
    costEstimateUsd: COST_ESTIMATE_USD,
  };
}

/** Chama a OpenAI e devolve a imagem estilizada. */
async function restyle(
  apiKey: string,
  model: string,
  input: RestyleInput,
): Promise<RestyleOutput> {
  const res = await fetch(OPENAI_EDITS_URL, {
    method: "POST",
    // Sem "content-type": o fetch define o boundary do multipart automaticamente.
    headers: { authorization: `Bearer ${apiKey}` },
    body: buildForm(input, model),
    signal: input.signal,
  });
  if (!res.ok) {
    // Corpo pode ecoar o request/prompt; toProviderError extrai só code/type e
    // devolve 402 curado (créditos) OU Error genérico só com status.
    throw await toProviderError(res);
  }
  return extractImage(await res.json() as OpenAiResponse);
}

/** Fábrica do provider OpenAI (a chave vive só neste closure). */
export function openaiProvider(
  apiKey: string,
  model: string,
): ImageStyleProvider {
  return {
    id: "openai",
    model,
    restyle: (input) => restyle(apiKey, model, input),
  };
}
