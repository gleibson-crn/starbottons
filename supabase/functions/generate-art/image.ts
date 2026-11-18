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
  /** Espelhamento no eixo local (antes do rotate). Só a arte seta. */
  readonly flipH?: boolean;
  readonly flipV?: boolean;
}

/** Sem transform: cover puro, centrado (reproduz o fundo cover fixo anterior). */
const DEFAULT_BG_OPTS: TransformOpts = {
  offset: { x: 0, y: 0 },
  scale: 1,
  rotation: 0,
};

/** UMA moldura já baixada + seu enquadramento próprio (ordem = z-order). */
export interface FrameLayer {
  readonly bytes: Uint8Array;
  readonly opts: TransformOpts;
}

/**
 * Teto do maior lado da MOLDURA (px). Espelha BACKGROUND_MAX_DIM do client
 * (downscale-image.ts): fotos/PNGs grandes são recortados no upload, mas a Edge
 * também limita defensivamente para não estourar o CPU do worker ao decodificar.
 */
export const FRAME_MAX_DIM = 1000;

/**
 * Reduz `img` para caber em `max`px no maior lado, preservando proporção e o
 * canal ALFA (usa resize do ImageScript, que mantém RGBA — nada de achatar/JPEG).
 * Nunca faz upscale (imagens já pequenas passam intactas).
 */
function clampToMax(img: Image, max: number): Image {
  const longest = Math.max(img.width, img.height);
  if (longest <= max) return img;
  const factor = max / longest;
  return img.resize(
    Math.max(1, Math.round(img.width * factor)),
    Math.max(1, Math.round(img.height * factor)),
  ) as Image;
}

/** Fator de cobertura: menor escala que faz a imagem cobrir o canvas todo. */
function coverScale(srcW: number, srcH: number, target: number): number {
  return Math.max(target / srcW, target / srcH);
}

/** Aplica cover + scale do usuário e (opcional) rotação, retornando a imagem escalada. */
function transformSource(
  src: Image,
  coverTarget: number,
  opts: TransformOpts,
): Image {
  const factor = coverScale(src.width, src.height, coverTarget) * (opts.scale || 1);
  const w = Math.max(1, Math.round(src.width * factor));
  const h = Math.max(1, Math.round(src.height * factor));
  const scaled = src.resize(w, h) as Image;
  // Ordem canônica: resize → flip (in-place na cópia `scaled`) → rotate.
  // ImageScript 1.3.0 expõe flip('horizontal'|'vertical'), não flipHorizontal().
  if (opts.flipH) scaled.flip('horizontal');
  if (opts.flipV) scaled.flip('vertical');
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
  maxDim?: number,
  coverTarget?: number,
): Promise<void> {
  const decoded = (await decodeImage(bytes)) as Image;
  const img = maxDim ? clampToMax(decoded, maxDim) : decoded;
  // `coverTarget` desacopla o diâmetro de COVER (ex.: círculo VISÍVEL da moldura)
  // da referência de CENTRO (sempre o canvas `artPx`). Default = artPx (arte/fundo).
  const layer = transformSource(img, coverTarget ?? artPx, opts);
  composeOntoCanvas(canvas, layer, artPx, dpi, opts);
}

/**
 * Pipeline completo: bytes de origem (+ fundo e moldura opcionais) → PNG base64
 * do tamanho da arte. Ordem das camadas (de baixo p/ cima):
 *   1. canvas transparente (a cor sólida vem do `<rect>` do SVG);
 *   2. FUNDO transformado (cover+scale+rotation+offset, SEM filtros) — quando há;
 *   3. ARTE do usuário transformada por cima do fundo;
 *   4. MOLDURAS por ÚLTIMO (até 3, NA FRENTE de tudo), compostas EM ORDEM do
 *      array (índice 0 primeiro = mais ao fundo; último = topo). Cada moldura
 *      faz COVER no círculo VISÍVEL (`frameCoverPx`, não a sangria — a borda
 *      fica na ÁREA DE APRESENTAÇÃO) mas com seu ENQUADRAMENTO próprio
 *      (offset/scale/rotation), espelhando o fundo. Centro de cada uma = artPx.
 *      Downscale defensivo a ≤FRAME_MAX_DIM preservando alfa (PNG transparente
 *      deixa a arte/molduras inferiores aparecerem no miolo).
 * Sem fundo/molduras, o resultado é idêntico ao comportamento atual.
 */
export async function composeArtwork(
  sourceBytes: Uint8Array,
  artPx: number,
  dpi: number,
  opts: TransformOpts,
  backgroundBytes?: Uint8Array | null,
  bgOpts?: TransformOpts,
  frames?: FrameLayer[] | null,
  frameCoverPx?: number,
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
  // Molduras no topo, EM ORDEM (z-order do array). Cada uma: cover no círculo
  // VISÍVEL (frameCoverPx), centro = artPx, com seu transform próprio.
  for (const frame of frames ?? []) {
    await composeLayer(
      canvas,
      frame.bytes,
      artPx,
      dpi,
      frame.opts,
      FRAME_MAX_DIM,
      frameCoverPx ?? artPx,
    );
  }
  const png = await canvas.encode();
  return encodeBase64(png);
}
