/** Rasteriza o SVG de layout → PNG (RGBA) via resvg-wasm e marca a DPI (pHYs). */

import { initWasm, Resvg } from "./deps.ts";
import { resvgWasm } from "./wasm-local.ts";
import { withDpi } from "./png.ts";

let wasmReady: Promise<void> | null = null;

/** Inicializa o WASM do resvg uma única vez por instância (idempotente).
 * Usa os bytes LOCAIS (wasm-local.ts) — sem fetch em runtime (self-contained). */
function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm(resvgWasm);
  }
  return wasmReady;
}

/**
 * @param svg tamanho do SVG já é artPx×artPx (fitTo original).
 * @returns PNG com chunk pHYs na dpi informada.
 */
export async function rasterizeSvg(
  svg: string,
  dpi: number,
): Promise<Uint8Array> {
  await ensureWasm();
  const resvg = new Resvg(svg, { fitTo: { mode: "original" } });
  const png = resvg.render().asPng() as Uint8Array;
  return withDpi(png, dpi);
}
