/**
 * Decodifica a imagem de origem (PNG/JPEG — ADR-002) e a compõe sobre um canvas
 * quadrado de artPx×artPx aplicando fit:cover + scale + rotation + offset.
 * Devolve o PNG resultante em base64 para embutir no SVG de layout.
 */

import { decodeImage, Image } from "./deps.ts";
import { encodeBase64 } from "@std/encoding/base64";
import { mmToPx } from "./geometry.ts";
import { assertSafeSource } from "./image-header.ts";
import { type ArtOptions } from "./types.ts";

/** Fator de cobertura: menor escala que faz a imagem cobrir o canvas todo. */
function coverScale(srcW: number, srcH: number, target: number): number {
  return Math.max(target / srcW, target / srcH);
}

/** Aplica cover + scale do usuário e (opcional) rotação, retornando a imagem escalada. */
function transformSource(src: Image, artPx: number, opts: ArtOptions): Image {
  const factor = coverScale(src.width, src.height, artPx) * (opts.scale || 1);
  const w = Math.max(1, Math.round(src.width * factor));
  const h = Math.max(1, Math.round(src.height * factor));
  const scaled = src.resize(w, h) as Image;
  return (opts.rotation ? scaled.rotate(opts.rotation) : scaled) as Image;
}

/**
 * Compõe a imagem transformada centralizada + offset sobre o canvas da arte.
 * O offset chega em MM (resolução-independente) e é convertido para px pela
 * MESMA fórmula do preview (mmToPx com o dpi_target da spec).
 */
function composeOntoCanvas(
  layer: Image,
  artPx: number,
  dpi: number,
  opts: ArtOptions,
): Image {
  const canvas = new Image(artPx, artPx); // transparente; fundo sólido vem do SVG
  const offsetXpx = mmToPx(opts.offset?.x ?? 0, dpi);
  const offsetYpx = mmToPx(opts.offset?.y ?? 0, dpi);
  const cx = Math.round((artPx - layer.width) / 2) + offsetXpx;
  const cy = Math.round((artPx - layer.height) / 2) + offsetYpx;
  canvas.composite(layer, cx, cy);
  return canvas;
}

/** Pipeline completo: bytes de origem → PNG base64 do tamanho da arte. */
export async function composeArtwork(
  sourceBytes: Uint8Array,
  artPx: number,
  dpi: number,
  opts: ArtOptions,
): Promise<string> {
  // F-002/F-003: valida magic bytes + teto de MP pelo HEADER antes de alocar o bitmap.
  assertSafeSource(sourceBytes);
  const src = await decodeImage(sourceBytes);
  const layer = transformSource(src as Image, artPx, opts);
  const canvas = composeOntoCanvas(layer, artPx, dpi, opts);
  const png = await canvas.encode();
  return encodeBase64(png);
}
