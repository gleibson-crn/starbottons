/**
 * (a) styles.resolveStyle: resolve todos os ids conhecidos com a cláusula/fidelidade
 * do MODO (faithful/cartoon/realistic) e rejeita id desconhecido com 400; strength
 * sofre clamp e vira linguagem.
 */

import { assert, assertEquals, assertThrows } from "@std/assert";
import { knownStyleIds, resolveStyle } from "./styles.ts";
import { StyleError } from "./types.ts";

const FAITHFUL_TAIL =
  "change ONLY the artistic style.";

/** Estilos CARTOON: viram desenho (fidelidade baixa). */
const CARTOON_IDS = new Set(["voce-amarelo", "anime", "ghibli"]);
/** Estilos REALISTAS: fotorrealistas, preservam pele/rosto (fidelidade alta). */
const REALISTIC_IDS = new Set(["guerreiro-espacial"]);

Deno.test("(a) resolve todos os ids com a cláusula/fidelidade do modo", () => {
  const ids = knownStyleIds();
  assert(ids.length === 9, `esperava 9 estilos, veio ${ids.length}`);
  for (const id of ids) {
    const r = resolveStyle(id, 0.6);
    assertEquals(r.styleId, id);
    assert(r.label.length > 0, `label vazio para ${id}`);

    if (CARTOON_IDS.has(id)) {
      // Cartoon: vira desenho, fidelidade baixa, sempre "strong", proíbe foto.
      assertEquals(r.mode, "cartoon");
      assertEquals(r.fidelity, "low");
      assertEquals(r.word, "strong");
      assert(
        r.prompt.includes("do NOT") &&
          r.prompt.includes("photographic, 3D or hyper-realistic"),
        `prompt cartoon de ${id} deve proibir aparência fotográfica`,
      );
      assert(
        !r.prompt.includes("Do not reference, name, write or imitate"),
        `prompt de personagem de ${id} não deve conter anti-IP`,
      );
    } else if (REALISTIC_IDS.has(id)) {
      // Realista: FOTORREALISTA, preserva rosto/PELE, fidelidade ALTA, "strong".
      assertEquals(r.mode, "realistic");
      assertEquals(r.fidelity, "high");
      assertEquals(r.word, "strong");
      assert(
        r.prompt.includes("PHOTOREALISTIC") && r.prompt.includes("SKIN TONE"),
        `prompt realista de ${id} deve exigir fotorrealismo e preservar a pele`,
      );
      assert(
        !r.prompt.includes("Do not reference, name, write or imitate"),
        `prompt de personagem de ${id} não deve conter anti-IP`,
      );
    } else {
      // Pintura fiel: preserva rosto/expressão/composição, fidelidade alta + anti-IP.
      assertEquals(r.mode, "faithful");
      assertEquals(r.fidelity, "high");
      assert(
        r.prompt.trim().endsWith(FAITHFUL_TAIL),
        `prompt fiel de ${id} deve terminar com a cláusula de preservação`,
      );
      assert(
        r.prompt.includes("preserve each face") &&
          r.prompt.includes("EXPRESSION"),
        `prompt fiel de ${id} deve reforçar a preservação de rosto/expressão`,
      );
      assert(
        r.prompt.includes("Do not reference, name, write or imitate"),
        `prompt fiel de ${id} deve conter a cláusula anti-IP`,
      );
    }
  }
});

Deno.test("(a) modo cartoon força strong mesmo com strength baixo", () => {
  const r = resolveStyle("voce-amarelo", 0.05);
  assertEquals(r.word, "strong"); // ignora a intensidade baixa recebida
  assertEquals(r.fidelity, "low");
});

Deno.test("(a) modo realista usa fidelidade ALTA (preserva a pele/rosto)", () => {
  const r = resolveStyle("guerreiro-espacial", 0.6);
  assertEquals(r.mode, "realistic");
  assertEquals(r.fidelity, "high");
});

Deno.test("(a) estilos de personagem citam a franquia de referência", () => {
  assert(resolveStyle("voce-amarelo", 0.6).prompt.includes("The Simpsons"));
  assert(resolveStyle("guerreiro-espacial", 0.6).prompt.includes("Star Wars"));
});

// Ghibli é EXCEÇÃO: citar "Studio Ghibli"/"Miyazaki" no prompt dispara 422
// content_policy (recusa "no estilo de artista/estúdio vivo"). Por isso o prompt
// descreve a estética genericamente — o nome fica só no rótulo do chip (cliente).
Deno.test("(a) ghibli NÃO cita o estúdio no prompt (evita moderação 422)", () => {
  const p = resolveStyle("ghibli", 0.6).prompt;
  assert(!p.includes("Ghibli") && !p.includes("Miyazaki"));
});

Deno.test("(a) style_id desconhecido lança StyleError(400)", () => {
  const err = assertThrows(() => resolveStyle("inexistente", 0.6), StyleError);
  assertEquals((err as StyleError).status, 400);
});

Deno.test("(a) strength sofre clamp 0..1", () => {
  assertEquals(resolveStyle("cartoon", -5).strength, 0);
  assertEquals(resolveStyle("cartoon", 42).strength, 1);
  assertEquals(resolveStyle("cartoon", 0.5).strength, 0.5);
});

Deno.test("(a) strength mapeia para subtle/moderate/strong no prompt", () => {
  assertEquals(resolveStyle("cartoon", 0.1).word, "subtle");
  assertEquals(resolveStyle("cartoon", 0.5).word, "moderate");
  assertEquals(resolveStyle("cartoon", 0.9).word, "strong");
  assert(resolveStyle("cartoon", 0.9).prompt.includes("strong"));
});
