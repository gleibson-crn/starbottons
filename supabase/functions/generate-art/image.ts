/**
 * Decodifica a imagem de origem (PNG/JPEG — ADR-002) e a compõe sobre um canvas
 * quadrado de artPx×artPx aplicando fit:cover + scale + rotation + offset.
 * Devolve o PNG resultante em base64 para embutir no SVG de layout.
 */

import { decodeImage, Image } from "./deps.ts";
import { encodeBase64 } from "@std/encoding/base64";
import { mmToPx } from "./geometry.ts";
import { assertSafeSource } from "./image-header.ts";

/**
 * Enquadramento aplicável a QUALQUER layer (arte ou fundo): offset em MM +
 * scale + rotation. `ArtOptions` é estruturalmente compatível.
 */
export interface TransformOpts {
  readonly offset: { x: number; y: number };
  readonly scale: number;
  readonly rotation: number;
}

/** Sem transform: cover puro, centrado (reproduz o fundo cover fixo anterior). */
const DEFAULT_BG_OPTS: TransformOpts = {
  offset: { x: 0, y: 0 },
  scale: 1,
  rotation: 0,
};

/** Fator de cobertura: menor escala que faz a imagem cobrir o canvas todo. */
function coverScale(srcW: number, srcH: number, target: number): number {
  return Math.max(target / srcW, target / srcH);
}

/** Aplica cover + scale do usuário e (opcional) rotação, retornando a imagem escalada. */
function transformSource(
  src: Image,
  artPx: number,
  opts: TransformOpts,
): Image {
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
  opts: TransformOpts,
): void {
  const offsetXpx = mmToPx(opts.offset?.x ?? 0, dpi);
  const offsetYpx = mmToPx(opts.offset?.y ?? 0, dpi);
  const cx = Math.round((artPx - layer.width) / 2) + offsetXpx;
  const cy = Math.round((artPx - layer.height) / 2) + offsetYpx;
  canvas.composite(layer, cx, cy);
}

/**
 * Decodifica, transforma (cover+scale+rotation) e compõe UM layer sobre o canvas
 * com seu offset em MM. Usado igual para fundo e arte → garante que preview e
 * impressão enquadrem pela MESMA fórmula.
 */
async function composeLayer(
  canvas: Image,
  bytes: Uint8Array,
  artPx: number,
  dpi: number,
  opts: TransformOpts,
): Promise<void> {
  const img = (await decodeImage(bytes)) as Image;
  const layer = transformSource(img, artPx, opts);
  composeOntoCanvas(canvas, layer, artPx, dpi, opts);
}

/**
 * Pipeline completo: bytes de origem (+ imagem de fundo opcional) → PNG base64
 * do tamanho da arte. Ordem: canvas transparente → (fundo TRANSFORMADO como
 * base, mesma lógica da arte: cover+scale+rotation+offset, SEM filtros) → arte
 * transformada por cima. Sem imagem de fundo, o canvas fica transparente e a cor
 * sólida vem do `<rect>` do SVG.
 */
export async function composeArtwork(
  sourceBytes: Uint8Array,
  artPx: number,
  dpi: number,
  opts: TransformOpts,
  backgroundBytes?: Uint8Array | null,
  bgOpts?: TransformOpts,
): Promise<string> {
  // F-002/F-003: valida magic bytes + teto de MP pelo HEADER antes de alocar o bitmap.
  assertSafeSource(sourceBytes);
  const canvas = new Image(artPx, artPx); // transparente por padrão
  if (backgroundBytes) {
    await composeLayer(
      canvas,
      backgroundBytes,
      artPx,
      dpi,
      bgOpts ?? DEFAULT_BG_OPTS,
    );
  }
  await composeLayer(canvas, sourceBytes, artPx, dpi, opts);
  const png = await canvas.encode();
  return encodeBase64(png);
}
