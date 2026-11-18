/**
 * Torna a Edge SELF-CONTAINED quanto aos binários WASM: em vez de buscá-los de
 * deno.land / esm.sh em RUNTIME (o que falha sob inspeção de HTTPS de antivírus/
 * proxy — a Deno vê a CA re-assinada como `UnknownIssuer`), os `.wasm` vêm
 * EMBUTIDOS como base64 (`./wasm/*.ts`, no grafo de imports → viajam com a
 * função; o runtime da Edge NÃO copia binários soltos).
 *
 * Dois grupos de wasm em runtime:
 *  - resvg: exportado como `resvgWasm` e passado a `initWasm` em raster.ts.
 *  - ImageScript: a lib busca INTERNAMENTE vários `utils/wasm/*.wasm`
 *    (font/svg/png/jpeg/zlib/gif/tiff) de deno.land, fora do nosso controle →
 *    interceptamos `globalThis.fetch` para servir os bytes locais nessas URLs.
 *
 * IMPORTANTE: este módulo DEVE ser o PRIMEIRO import do index.ts — o ImageScript
 * dispara os fetches ao carregar. O patch abaixo é SÍNCRONO no eval, então está
 * no lugar antes de qualquer import de `imagescript`.
 */

import { decodeBase64 } from "@std/encoding/base64";
import { RESVG_B64 } from "./wasm/resvg-b64.ts";
import { IMAGESCRIPT_WASM_B64 } from "./wasm/imagescript-wasm.ts";

/** Bytes do WASM do resvg (consumidos por raster.ts via initWasm). */
export const resvgWasm: Uint8Array = decodeBase64(RESVG_B64);

/** Prefixo das URLs que o imagescript@1.3.0 busca (utils/wasm/<nome>.wasm). */
const IMG_WASM_PREFIX =
  "https://deno.land/x/imagescript@1.3.0/utils/wasm/";

/** URL exata → bytes locais, para servir no fetch interceptado. */
const localWasm = new Map<string, Uint8Array>();
for (const [name, b64] of Object.entries(IMAGESCRIPT_WASM_B64)) {
  localWasm.set(IMG_WASM_PREFIX + name, decodeBase64(b64));
}

const originalFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
    ? input.href
    : input.url;
  const bytes = localWasm.get(url);
  if (bytes) {
    // cast: Uint8Array<ArrayBufferLike> não casa direto em BodyInit no lib.dom.
    return Promise.resolve(
      new Response(bytes as unknown as BodyInit, {
        headers: { "content-type": "application/wasm" },
      }),
    );
  }
  return originalFetch(input, init);
}) as typeof fetch;
