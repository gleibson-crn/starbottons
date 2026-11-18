/**
 * ÚNICO arquivo que conhece o "wire" do Google Gemini. Trocar de provedor
 * (OpenAI etc.) só toca aqui + provider.selectProvider.
 *
 * ── API confirmada (WebFetch em https://ai.google.dev/gemini-api/docs/image-generation
 *    e .../docs/models — consulta em 2026-07-30) ──────────────────────────────
 * A doc atual aponta uma "Interactions API" (POST /v1beta/interactions) para os
 * modelos de imagem da família *flash-image* ("Nano Banana"). Esse formato novo
 * ainda é INCERTO/instável, então implementamos contra o endpoint CLÁSSICO
 * consolidado de generateContent, que aceita os mesmos modelos de imagem:
 *
 *   Endpoint : POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   Modelo   : env GEMINI_MODEL (default "gemini-2.5-flash-image" — flash-image / Nano Banana)
 *   Auth     : header `x-goog-api-key: <KEY>`   (NUNCA em query string / NUNCA logada)
 *   Request  : { contents:[{ parts:[ {text:"<prompt>"},
 *                                     {inline_data:{mime_type,data:"<base64>"}} ] }] }
 *   Response : candidates[0].content.parts[].inlineData.data  (imagem em base64)
 *
 * Se/quando a Interactions API estabilizar, migrar buildBody/extractImage aqui —
 * o restante da Edge não muda.
 */

import { decodeBase64, encodeBase64 } from "./deps.ts";
import { StyleError } from "./types.ts";
import { INSUFFICIENT_CREDITS_MSG } from "./openai-client.ts";
import type {
  ImageStyleProvider,
  RestyleInput,
  RestyleOutput,
} from "./provider.ts";

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Custo estimado por imagem de saída (flash-image ≈ 1290 tokens de imagem a
 * ~US$30/1M tokens ≈ US$0,039). Estimativa informativa, não faturamento.
 */
const COST_ESTIMATE_USD = 0.039;

/** Forma parcial da resposta que nos interessa (tolerante a snake/camelCase). */
interface InlineData {
  data?: string;
  mimeType?: string;
  mime_type?: string;
}
interface GeminiPart {
  inlineData?: InlineData;
  inline_data?: InlineData;
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

/** Monta o corpo generateContent (prompt + imagem inline em base64). */
function buildBody(input: RestyleInput): unknown {
  return {
    contents: [{
      parts: [
        { text: input.prompt },
        {
          inline_data: {
            mime_type: input.mime,
            data: encodeBase64(input.bytes),
          },
        },
      ],
    }],
  };
}

/** Normaliza o mime devolvido para o contrato (png/jpeg; default png). */
function normalizeMime(raw: string | undefined): "image/png" | "image/jpeg" {
  return raw === "image/jpeg" ? "image/jpeg" : "image/png";
}

/** Extrai a primeira imagem inline da resposta; lança se não houver. */
function extractImage(json: GeminiResponse): RestyleOutput {
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data;
    if (inline?.data) {
      return {
        bytes: decodeBase64(inline.data),
        mime: normalizeMime(inline.mimeType ?? inline.mime_type),
        costEstimateUsd: COST_ESTIMATE_USD,
      };
    }
  }
  throw new Error("resposta do Gemini sem imagem inline");
}

/** Chama o Gemini e devolve a imagem estilizada. */
async function restyle(
  apiKey: string,
  model: string,
  input: RestyleInput,
): Promise<RestyleOutput> {
  const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(buildBody(input)),
    signal: input.signal,
  });
  if (!res.ok) {
    // 429 (RESOURCE_EXHAUSTED / quota) → falta de créditos, mesmo 402 curado do
    // OpenAI. Demais: Error genérico só com status (corpo pode ecoar o request).
    if (res.status === 429) {
      throw new StyleError(402, INSUFFICIENT_CREDITS_MSG, "insufficient_credits");
    }
    throw new Error(`Gemini respondeu HTTP ${res.status}`);
  }
  return extractImage(await res.json() as GeminiResponse);
}

/** Fábrica do provider Gemini (a chave vive só neste closure). */
export function geminiProvider(
  apiKey: string,
  model: string,
): ImageStyleProvider {
  return {
    id: "gemini",
    model,
    restyle: (input) => restyle(apiKey, model, input),
  };
}
