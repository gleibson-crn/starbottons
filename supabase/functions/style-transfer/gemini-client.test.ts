/**
 * Gemini: 429 (RESOURCE_EXHAUSTED / quota) → mesmo 402 curado de falta de
 * créditos; outros status seguem Error genérico só com status. Fake de
 * globalThis.fetch (API paga sem sandbox; mocking-strategy). Sem rede real.
 */

import { assert, assertEquals, assertRejects } from "@std/assert";
import { geminiProvider } from "./gemini-client.ts";
import type { RestyleInput } from "./provider.ts";
import { StyleError } from "./types.ts";

function fakeInput(): RestyleInput {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    mime: "image/png",
    prompt: "estilo x",
    strength: 0.6,
    signal: new AbortController().signal,
  };
}

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

Deno.test("Gemini 429 → StyleError 402 code insufficient_credits", async () => {
  const restore = stubFetch(429, {
    error: { status: "RESOURCE_EXHAUSTED", message: "quota" },
  });
  try {
    const provider = geminiProvider("g-fake", "gemini-2.5-flash-image");
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

Deno.test("Gemini 500 → Error genérico (não StyleError, sem vazar corpo)", async () => {
  const restore = stubFetch(500, { error: { message: "segredo interno" } });
  try {
    const provider = geminiProvider("g-fake", "gemini-2.5-flash-image");
    const err = await assertRejects(() => provider.restyle(fakeInput()), Error);
    assert(!(err instanceof StyleError));
    assertEquals(err.message, "Gemini respondeu HTTP 500");
    assert(!err.message.includes("segredo"));
  } finally {
    restore();
  }
});
