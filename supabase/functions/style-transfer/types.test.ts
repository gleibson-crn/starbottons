/**
 * (c) Serialização do StyleError para o corpo devolvido ao client. `code` só
 * aparece quando presente; sem code o corpo permanece `{ error }` como hoje.
 * Função pura — sem rede, sem Deno.serve.
 */

import { assertEquals } from "@std/assert";
import { StyleError, styleErrorBody } from "./types.ts";

Deno.test("(c) styleErrorBody inclui code quando presente", () => {
  const err = new StyleError(
    402,
    "É necessário inserir créditos na OpenAI para usar os filtros com IA.",
    "insufficient_credits",
  );
  assertEquals(styleErrorBody(err), {
    error: "É necessário inserir créditos na OpenAI para usar os filtros com IA.",
    code: "insufficient_credits",
  });
});

Deno.test("(c) styleErrorBody sem code mantém só { error } (retrocompat)", () => {
  const err = new StyleError(502, "falha ao aplicar estilo");
  const body = styleErrorBody(err);
  assertEquals(body, { error: "falha ao aplicar estilo" });
  assertEquals("code" in body, false); // chave code ausente, não undefined
});
