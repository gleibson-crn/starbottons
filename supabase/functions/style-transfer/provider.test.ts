/**
 * (b) caminho 503 quando não há chave nem mock; (c) modo mock ecoa a imagem.
 * Também cobre o mapeamento de falha do provider → 502 via FakeImageStyleProvider.
 *
 * SEM rede: nunca chama o Gemini. Justificativa (mocking-strategy): API paga sem
 * sandbox → usamos o provider "mock" (código de produção) e um Fake local.
 */

import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  type ImageStyleProvider,
  requireProvider,
  runRestyle,
  selectProvider,
} from "./provider.ts";
import { StyleError } from "./types.ts";

/** Limpa as envs que dirigem a seleção de provider. */
function clearEnv(): void {
  Deno.env.delete("STYLE_TRANSFER_MOCK");
  Deno.env.delete("STYLE_PROVIDER");
  Deno.env.delete("OPENAI_API_KEY");
  Deno.env.delete("OPENAI_MODEL");
  Deno.env.delete("GEMINI_API_KEY");
  Deno.env.delete("GEMINI_MODEL");
}

const payload = {
  bytes: new Uint8Array([1, 2, 3, 4]),
  mime: "image/png" as const,
  prompt: "estilo x",
  strength: 0.6,
};
const ctx = { userId: "user-1", styleId: "cartoon" };

Deno.test("(a) DEFAULT é openai: com OPENAI_API_KEY escolhe provider openai", () => {
  clearEnv();
  Deno.env.set("OPENAI_API_KEY", "sk-fake");
  try {
    const p = selectProvider();
    assertEquals(p?.id, "openai");
    assertEquals(p?.model, "gpt-image-1.5"); // default OPENAI_MODEL
  } finally {
    clearEnv();
  }
});

Deno.test("(a) OPENAI_MODEL sobrescreve o modelo default", () => {
  clearEnv();
  Deno.env.set("OPENAI_API_KEY", "sk-fake");
  Deno.env.set("OPENAI_MODEL", "gpt-image-1-mini");
  try {
    assertEquals(selectProvider()?.model, "gpt-image-1-mini");
  } finally {
    clearEnv();
  }
});

Deno.test("(a) STYLE_PROVIDER=gemini escolhe provider gemini", () => {
  clearEnv();
  Deno.env.set("STYLE_PROVIDER", "gemini");
  Deno.env.set("GEMINI_API_KEY", "g-fake");
  try {
    assertEquals(selectProvider()?.id, "gemini");
  } finally {
    clearEnv();
  }
});

Deno.test("(a) mock tem precedência sobre STYLE_PROVIDER e chaves", () => {
  clearEnv();
  Deno.env.set("STYLE_TRANSFER_MOCK", "1");
  Deno.env.set("STYLE_PROVIDER", "openai");
  Deno.env.set("OPENAI_API_KEY", "sk-fake");
  try {
    assertEquals(selectProvider()?.id, "mock");
  } finally {
    clearEnv();
  }
});

Deno.test("(b) openai sem OPENAI_API_KEY: selectProvider null → requireProvider 503", () => {
  clearEnv();
  Deno.env.set("STYLE_PROVIDER", "openai");
  try {
    assertEquals(selectProvider(), null);
    const err = (() => {
      try {
        requireProvider();
      } catch (e) {
        return e;
      }
    })();
    assert(err instanceof StyleError);
    assertEquals((err as StyleError).status, 503);
  } finally {
    clearEnv();
  }
});

Deno.test("(b') gemini sem GEMINI_API_KEY: selectProvider null → 503", () => {
  clearEnv();
  Deno.env.set("STYLE_PROVIDER", "gemini");
  try {
    assertEquals(selectProvider(), null);
  } finally {
    clearEnv();
  }
});

Deno.test("(b) sem chave e sem mock: selectProvider null → requireProvider 503", () => {
  clearEnv();
  try {
    assertEquals(selectProvider(), null);
    let thrown: unknown;
    try {
      requireProvider();
    } catch (e) {
      thrown = e;
    }
    assert(thrown instanceof StyleError);
    assertEquals((thrown as StyleError).status, 503);
    assertEquals((thrown as StyleError).message, "style transfer indisponível");
  } finally {
    clearEnv();
  }
});

Deno.test("(c) STYLE_TRANSFER_MOCK=1: provider mock ecoa a imagem de entrada", async () => {
  clearEnv();
  Deno.env.set("STYLE_TRANSFER_MOCK", "1");
  try {
    const provider = requireProvider();
    assertEquals(provider.id, "mock");
    const out = await runRestyle(provider, payload, ctx);
    assertEquals(out.bytes, payload.bytes); // echo byte a byte
    assertEquals(out.mime, "image/png");
    assertEquals(out.costEstimateUsd, undefined);
  } finally {
    clearEnv();
  }
});

Deno.test("(c') mock tem precedência sobre a presença da chave", () => {
  clearEnv();
  Deno.env.set("STYLE_TRANSFER_MOCK", "1");
  Deno.env.set("GEMINI_API_KEY", "nao-deve-ser-usada");
  try {
    assertEquals(selectProvider()?.id, "mock");
  } finally {
    clearEnv();
  }
});

Deno.test("falha do provider vira StyleError(502) genérico", async () => {
  const fake: ImageStyleProvider = {
    id: "fake",
    model: "fake-1",
    restyle: () => Promise.reject(new Error("boom interno com detalhe secreto")),
  };
  const err = await assertRejects(
    () => runRestyle(fake, payload, ctx),
    StyleError,
  );
  assertEquals((err as StyleError).status, 502);
  assertEquals((err as StyleError).message, "falha ao aplicar estilo");
  assertEquals((err as StyleError).code, undefined); // 502 genérico não tem code
});

Deno.test("(b) StyleError do provider PROPAGA tal qual (não vira 502)", async () => {
  const credits = new StyleError(
    402,
    "É necessário inserir créditos na OpenAI para usar os filtros com IA.",
    "insufficient_credits",
  );
  const fake: ImageStyleProvider = {
    id: "fake",
    model: "fake-1",
    restyle: () => Promise.reject(credits),
  };
  const err = await assertRejects(
    () => runRestyle(fake, payload, ctx),
    StyleError,
  );
  assertEquals((err as StyleError).status, 402); // preservado, não 502
  assertEquals((err as StyleError).code, "insufficient_credits");
  assert(err === credits); // re-lançado tal qual (mesma instância)
});
