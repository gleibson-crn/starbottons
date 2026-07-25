/**
 * Testes das defesas pré-decode (AUDIT-2026-07-25):
 * F-003 magic bytes (só PNG/JPEG) e F-002 teto de 24MP lido do HEADER.
 * Sem dependências externas — roda offline com `deno test`.
 */

import { assert, assertEquals, assertThrows } from "@std/assert";
import { assertSafeSource, MAX_SOURCE_PIXELS } from "./image-header.ts";
import { ArtError } from "./types.ts";

/** Monta um cabeçalho PNG mínimo (assinatura + IHDR com w×h). */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** Monta um JPEG mínimo: SOI + APP0(curto) + SOF0 com h×w. */
function jpegHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array([
    0xff,
    0xd8, // SOI
    0xff,
    0xe0,
    0x00,
    0x02, // APP0, len=2 (sem payload)
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08, // SOF0, len, precision
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03, // components
  ]);
  return bytes;
}

Deno.test("F-003: aceita PNG válido e lê dimensões do IHDR", () => {
  const info = assertSafeSource(pngHeader(520, 520));
  assertEquals(info, { mime: "image/png", width: 520, height: 520 });
});

Deno.test("F-003: aceita JPEG válido e lê dimensões do SOF0", () => {
  const info = assertSafeSource(jpegHeader(638, 638));
  assertEquals(info, { mime: "image/jpeg", width: 638, height: 638 });
});

Deno.test("F-003: rejeita assinatura não-imagem (ex.: WebP/PDF) com 400", () => {
  const webp = new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46,
    0,
    0,
    0,
    0,
    0x57,
    0x45,
    0x42,
    0x50,
  ]);
  const err = assertThrows(() => assertSafeSource(webp), ArtError);
  assertEquals((err as ArtError).status, 400);
});

Deno.test("F-002: rejeita decode-bomb (30000×30000 ~900MP) com 422 pelo HEADER", () => {
  const bomb = pngHeader(30000, 30000);
  const err = assertThrows(() => assertSafeSource(bomb), ArtError);
  assertEquals((err as ArtError).status, 422);
});

Deno.test("F-002: limiar — logo abaixo passa, logo acima rejeita", () => {
  const side = Math.floor(Math.sqrt(MAX_SOURCE_PIXELS)); // ~4898
  assert(assertSafeSource(pngHeader(side, side)).width === side);
  assertThrows(
    () => assertSafeSource(pngHeader(side + 200, side + 200)),
    ArtError,
  );
});
