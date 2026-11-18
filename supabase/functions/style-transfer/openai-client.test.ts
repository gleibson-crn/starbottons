/**
 * (c) Parser da resposta da OpenAI — função pura `extractImage`, testada com um
 * JSON fake `{ data: [ { b64_json: ... } ] }`. SEM rede: nunca chama a OpenAI
 * de verdade (API paga sem sandbox; ver mocking-strategy).
 *
 * A classificação de erro do provedor é testada com um FAKE de globalThis.fetch
 * (justificativa mocking-strategy: API paga sem sandbox; mockamos só o externo).
 * Nenhum teste toca a OpenAI real.
 */

/** RestyleInput mínimo (o fake fetch ignora o corpo). */
function fakeInput(): RestyleInput {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    mime: "image/png",
    prompt: "estilo x",
    strength: 0.6,
    signal: new AbortController().signal,
  };
}

/** Instala um fake fetch que devolve `status` + `body` JSON; retorna restore. */
function stubFetch(status: number, body: unknown): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  return () => {
    globalThis.fetch = original;
  };
}

import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { encodeBase64 } from "./deps.ts";
import { extractImage, openaiProvider } from "./openai-client.ts";
import type { RestyleInput } from "./provider.ts";
import { StyleError } from "./types.ts";

Deno.test("(c) extractImage decodifica b64_json → bytes corretos + mime png", () => {
  const original = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x42, 0x43]);
  const json = { data: [{ b64_json: encodeBase64(original) }] };

  const out = extractImage(json);

  assertEquals(out.bytes, original); // round-trip byte a byte
  assertEquals(out.mime, "image/png"); // gpt-image-1 devolve PNG
  assertEquals(typeof out.costEstimateUsd, "number");
});

Deno.test("(c) extractImage lança quando não há imagem na resposta", () => {
  assertThrows(() => extractImage({ data: [] }), Error, "sem b64_json");
  assertThrows(() => extractImage({}), Error, "sem b64_json");
  assertThrows(
    () => extractImage({ data: [{}] }),
    Error,
    "sem b64_json",
  );
});

Deno.test("(a) 400 billing_hard_limit → StyleError 402 code insufficient_credits", async () => {
  const restore = stubFetch(400, {
    error: {
      type: "billing_limit_user_error",
      code: "billing_hard_limit_reached",
      message: "Billing hard limit has been reached.",
    },
  });
  try {
    const provider = openaiProvider("sk-fake", "gpt-image-1");
    const err = await assertRejects(
      () => provider.restyle(fakeInput()),
      StyleError,
    );
    assertEquals(err.status, 402);
    assertEquals(err.code, "insufficient_credits");
    // A mensagem crua da OpenAI NÃO pode vazar.
    assert(!err.message.includes("Billing hard limit"));
    assertEquals(
      err.message,
      "É necessário inserir créditos na OpenAI para usar os filtros com IA.",
    );
  } finally {
    restore();
  }
});

Deno.test("(a) 429 insufficient_quota → StyleError 402 code insufficient_credits", async () => {
  const restore = stubFetch(429, {
    error: { type: "insufficient_quota", code: "insufficient_quota" },
  });
  try {
    const provider = openaiProvider("sk-fake", "gpt-image-1");
    const err = await assertRejects(
      () => provider.restyle(fakeInput()),
      StyleError,
    );
    assertEquals(err.status, 402);
    assertEquals(err.code, "insufficient_credits");
  } finally {
    restore();
  }
});

Deno.test("(a) 500 genérico continua Error genérico (não StyleError, sem vazar corpo)", async () => {
  const restore = stubFetch(500, {
    error: { type: "server_error", message: "segredo interno do provedor" },
  });
  try {
    const provider = openaiProvider("sk-fake", "gpt-image-1");
    const err = await assertRejects(() => provider.restyle(fakeInput()), Error);
    assert(!(err instanceof StyleError)); // erro genérico, não de domínio
    assertEquals(err.message, "OpenAI respondeu HTTP 500");
    assert(!err.message.includes("segredo")); // corpo cru não vaza
  } finally {
    restore();
  }
});
