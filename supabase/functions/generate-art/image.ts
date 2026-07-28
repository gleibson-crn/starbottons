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

/**
 * Desenha a IMAGEM de fundo (cena/foto) em COVER, centralizada, preenchendo o
 * canvas artPx×artPx — como uma camada de BASE, SOB a arte do usuário e SEM o
 * transform de enquadramento (só a arte recebe offset/scale/rotation). Compor
 * aqui (bitmap/ImageScript) em vez de embutir outra imagem no SVG mantém o resvg
 * rasterizando UMA imagem só — o custo de CPU volta ao de antes do fundo, dentro
 * do limite do worker da Edge.
 */
function drawCoverBackground(canvas: Image, bg: Image, artPx: number): void {
  const factor = coverScale(bg.width, bg.height, artPx);
  const w = Math.max(1, Math.round(bg.width * factor));
  const h = Math.max(1, Math.round(bg.height * factor));
  const cover = bg.resize(w, h) as Image;
  const x = Math.round((artPx - w) / 2);
  const y = Math.round((artPx - h) / 2);
  canvas.composite(cover, x, y);
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
  canvas: Image,
  layer: Image,
  artPx: number,
  dpi: number,
  opts: ArtOptions,
): void {
  const offsetXpx = mmToPx(opts.offset?.x ?? 0, dpi);
  const offsetYpx = mmToPx(opts.offset?.y ?? 0, dpi);
  const cx = Math.round((artPx - layer.width) / 2) + offsetXpx;
  const cy = Math.round((artPx - layer.height) / 2) + offsetYpx;
  canvas.composite(layer, cx, cy);
}

/**
 * Pipeline completo: bytes de origem (+ imagem de fundo opcional) → PNG base64
 * do tamanho da arte. Ordem: canvas transparente → (imagem de fundo em COVER,
 * base) → arte transformada por cima. Sem imagem de fundo, o canvas fica
 * transparente e a cor sólida vem do `<rect>` do SVG.
 */
export async function composeArtwork(
  sourceBytes: Uint8Array,
  artPx: number,
  dpi: number,
  opts: ArtOptions,
  backgroundBytes?: Uint8Array | null,
): Promise<string> {
  // F-002/F-003: valida magic bytes + teto de MP pelo HEADER antes de alocar o bitmap.
  assertSafeSource(sourceBytes);
  const canvas = new Image(artPx, artPx); // transparente por padrão
  if (backgroundBytes) {
    const bg = (await decodeImage(backgroundBytes)) as Image;
    drawCoverBackground(canvas, bg, artPx);
  }
  const src = await decodeImage(sourceBytes);
  const layer = transformSource(src as Image, artPx, opts);
  composeOntoCanvas(canvas, layer, artPx, dpi, opts);
  const png = await canvas.encode();
  return encodeBase64(png);
}
