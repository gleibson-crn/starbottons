/**
 * (d) assertSafeSource rejeita assinatura inválida (400) e decode-bomb >24MP
 * (422), lendo dimensões só do HEADER. Sem dependências externas — roda offline.
 */

import { assert, assertEquals, assertThrows } from "@std/assert";
import { assertSafeSource, MAX_SOURCE_PIXELS } from "./image-header.ts";
import { StyleError } from "./types.ts";

/** Cabeçalho PNG mínimo (assinatura + IHDR com w×h). */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

Deno.test("(d) aceita PNG válido e lê dimensões do IHDR", () => {
  const info = assertSafeSource(pngHeader(520, 520));
  assertEquals(info, { mime: "image/png", width: 520, height: 520 });
});

Deno.test("(d) rejeita assinatura não-imagem (ex.: WebP) com 400", () => {
  const webp = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
  ]);
  const err = assertThrows(() => assertSafeSource(webp), StyleError);
  assertEquals((err as StyleError).status, 400);
});

Deno.test("(d) rejeita decode-bomb (30000×30000 ~900MP) com 422", () => {
  const bomb = pngHeader(30000, 30000);
  const err = assertThrows(() => assertSafeSource(bomb), StyleError);
  assertEquals((err as StyleError).status, 422);
});

Deno.test("(d) limiar — logo abaixo passa, logo acima rejeita", () => {
  const side = Math.floor(Math.sqrt(MAX_SOURCE_PIXELS));
  assert(assertSafeSource(pngHeader(side, side)).width === side);
  assertThrows(
    () => assertSafeSource(pngHeader(side + 200, side + 200)),
    StyleError,
  );
});
