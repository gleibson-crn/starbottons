/**
 * Abstração de provedor de style transfer — ponto único de troca de backend
 * (Gemini hoje; OpenAI/outro amanhã). O handler nunca conhece o "wire" concreto.
 *
 * Seleção por ambiente (precedência):
 *   1. STYLE_TRANSFER_MOCK=1 → provider "mock" (echo da imagem; sem rede).
 *   2. senão, conforme STYLE_PROVIDER ("openai" | "gemini"; DEFAULT "openai"):
 *        openai → exige OPENAI_API_KEY (senão null ⇒ 503); modelo OPENAI_MODEL
 *                 (default "gpt-image-1.5").
 *        gemini → exige GEMINI_API_KEY (senão null ⇒ 503); modelo GEMINI_MODEL
 *                 (default "gemini-2.5-flash-image").
 *   `null` ⇒ feature off (o handler responde 503).
 */

import type { SourceInfo } from "./image-header.ts";
import { StyleError } from "./types.ts";
import { geminiProvider } from "./gemini-client.ts";
import { openaiProvider } from "./openai-client.ts";

/**
 * Orçamento de tempo do provider. Edição de imagem por IA (gpt-image-1 com
 * `input_fidelity: high`) é LENTA e VARIÁVEL — normalmente ~20-40s, mas pode
 * passar de 60s. 45s cortava chamadas boas → 502 "falha ao aplicar estilo".
 * 120s cobre a grande maioria (a espera é I/O, não consome CPU do worker); o
 * cliente aguarda com "Aplicando estilo…" + Cancelar.
 */
export const TIME_BUDGET_MS = 120_000;

/** Payload de entrada (bytes já validados por assertSafeSource). */
export interface RestylePayload {
  readonly bytes: Uint8Array;
  readonly mime: SourceInfo["mime"];
  readonly prompt: string;
  readonly strength: number;
  /**
   * Fidelidade à imagem de entrada (OpenAI `input_fidelity`). "high" preserva
   * rosto/composição (estilos de pintura); "low" libera reinventar a cena
   * (estilos de personagem). Ausente ⇒ "high" (default seguro). Gemini/mock ignoram.
   */
  readonly fidelity?: "high" | "low";
}

/** Entrada do provider = payload + sinal de cancelamento por timeout. */
export interface RestyleInput extends RestylePayload {
  readonly signal: AbortSignal;
}

/** Saída do provider: bytes da imagem estilizada + custo estimado opcional. */
export interface RestyleOutput {
  readonly bytes: Uint8Array;
  readonly mime: "image/png" | "image/jpeg";
  readonly costEstimateUsd?: number;
}

/** Contrato do provedor de estilo. */
export interface ImageStyleProvider {
  readonly id: string;
  readonly model: string;
  restyle(input: RestyleInput): Promise<RestyleOutput>;
}

/** Provider de MOCK: devolve a própria imagem de entrada como "estilizada". */
export function mockProvider(): ImageStyleProvider {
  return {
    id: "mock",
    model: "mock-echo",
    restyle: (input) =>
      Promise.resolve({ bytes: input.bytes, mime: input.mime }),
  };
}

/** Provider OpenAI real, ou `null` se faltar OPENAI_API_KEY. */
function selectOpenai(): ImageStyleProvider | null {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return null;
  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-image-1.5";
  return openaiProvider(key, model);
}

/** Provider Gemini real, ou `null` se faltar GEMINI_API_KEY. */
function selectGemini(): ImageStyleProvider | null {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return null;
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash-image";
  return geminiProvider(key, model);
}

/** Escolhe o provider conforme o ambiente. `null` ⇒ feature desligada (503). */
export function selectProvider(): ImageStyleProvider | null {
  if (Deno.env.get("STYLE_TRANSFER_MOCK") === "1") return mockProvider();
  const which = Deno.env.get("STYLE_PROVIDER") ?? "openai";
  return which === "gemini" ? selectGemini() : selectOpenai();
}

/** Provider ou 503 (mensagem segura, sem stack) quando a feature está off. */
export function requireProvider(): ImageStyleProvider {
  const provider = selectProvider();
  if (!provider) throw new StyleError(503, "style transfer indisponível");
  return provider;
}

/** Contexto de log (sem imagem, sem chave). */
export interface RestyleContext {
  readonly userId: string;
  readonly styleId: string;
}

/**
 * Roda o provider dentro do orçamento de tempo (AbortController). Um StyleError
 * lançado pelo provider (erro de domínio curado, ex.: 402 de créditos) PROPAGA
 * tal qual. Qualquer outra falha (timeout/erro/resposta inválida) vira 502 com
 * mensagem genérica; o detalhe vai só para console.error com user/style — nunca
 * imagem nem chave.
 */
export async function runRestyle(
  provider: ImageStyleProvider,
  payload: RestylePayload,
  ctx: RestyleContext,
): Promise<RestyleOutput> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIME_BUDGET_MS);
  try {
    return await provider.restyle({ ...payload, signal: controller.signal });
  } catch (err) {
    // StyleError já é erro de DOMÍNIO curado (ex.: 402 de créditos) — mensagem e
    // code seguros; re-lança tal qual. Só erros NÃO-StyleError viram 502 genérico.
    if (err instanceof StyleError) throw err;
    const detail = err instanceof Error ? err.message : "erro desconhecido";
    console.error(
      `[style-transfer] provider falhou user=${ctx.userId} style=${ctx.styleId}: ${detail}`,
    );
    // Timeout do orçamento (AbortController) → mensagem clara e acionável, em vez
    // do genérico "falha ao aplicar estilo".
    const aborted = (err as { name?: string })?.name === "AbortError";
    if (aborted) {
      throw new StyleError(
        504,
        "O provedor de IA demorou demais para responder. Tente novamente.",
        "timeout",
      );
    }
    throw new StyleError(502, "falha ao aplicar estilo");
  } finally {
    clearTimeout(timer);
  }
}
