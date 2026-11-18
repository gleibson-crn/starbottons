/**
 * Orquestra o pipeline de arte de impressão (ADR-001/004):
 * origem → compõe (cover/scale/rotation/offset) → SVG de layout → PNG@dpi →
 * grava em renders/ → registra assets → assina URLs.
 */

import { type SupabaseClient } from "./deps.ts";
import {
  composeArtwork,
  type FrameLayer,
  type TransformOpts,
} from "./image.ts";
import { assertSafeSource } from "./image-header.ts";
import { buildLayoutSvg } from "./svg.ts";
import { rasterizeSvg } from "./raster.ts";
import { computeLayout } from "./geometry.ts";
import {
  downloadSource,
  fetchUploadPath,
  signRender,
  uploadRender,
} from "./db.ts";
import { insertAsset } from "./jobs.ts";
import {
  ArtError,
  type ArtLayout,
  type AssetResult,
  type Frame,
  type GenerateRequest,
  type PrintSpec,
} from "./types.ts";

/** Grava um artefato + registra asset + devolve o descritor assinado. */
async function storeAsset(
  db: SupabaseClient,
  jobId: string,
  name: string,
  kind: string,
  bytes: Uint8Array,
  mime: string,
  layout: ArtLayout,
): Promise<AssetResult> {
  const path = await uploadRender(db, jobId, name, bytes, mime);
  await insertAsset(db, jobId, kind, path, mime, bytes.length, layout);
  return {
    kind,
    signed_url: await signRender(db, path),
    width_px: layout.artPx,
    height_px: layout.artPx,
    dpi: layout.dpi,
  };
}

/**
 * Baixa a imagem de fundo (path no bucket uploads) e devolve os BYTES crus
 * (PNG/JPEG — o ImageScript decodifica ambos ao compor). Fallback gracioso:
 * qualquer falha (download/validação/teto de MP) loga e retorna null → a
 * composição cai só na cor de fundo, sem quebrar a geração.
 */
async function loadBackgroundImage(
  db: SupabaseClient,
  path: string | null | undefined,
): Promise<Uint8Array | null> {
  if (!path) return null;
  try {
    const bytes = await downloadSource(db, path);
    assertSafeSource(bytes); // valida magic bytes + teto de MP
    return bytes;
  } catch (err) {
    console.error(
      "[generate-art] fundo de imagem indisponível, usando cor:",
      err,
    );
    return null;
  }
}

/**
 * Baixa UMA moldura (path no bucket uploads) e devolve os BYTES crus do PNG.
 * EXIGE PNG: a moldura precisa do canal alfa (transparência no miolo) para a
 * arte aparecer sob ela — um JPEG opaco taparia o botton inteiro. Fallback
 * gracioso: download/validação/MP/mime inválido loga e retorna null → a moldura
 * é PULADA, sem quebrar a geração.
 */
async function loadFrameBytes(
  db: SupabaseClient,
  path: string,
): Promise<Uint8Array | null> {
  try {
    const bytes = await downloadSource(db, path);
    const info = assertSafeSource(bytes); // magic bytes + teto de MP
    if (info.mime !== "image/png") {
      throw new ArtError(400, "moldura precisa ser PNG (com alfa)");
    }
    return bytes;
  } catch (err) {
    console.error("[generate-art] moldura indisponível, ignorando:", err);
    return null;
  }
}

/** Enquadramento (offset MM/scale/rotation) de UMA moldura → TransformOpts. */
function frameOpts(frame: Frame): TransformOpts {
  return {
    offset: frame.offset ?? { x: 0, y: 0 },
    scale: frame.scale ?? 1,
    rotation: frame.rotation ?? 0,
  };
}

/**
 * Carrega as molduras (≤3, já sanitizadas no parser) PRESERVANDO A ORDEM do
 * array (z-order). Cada moldura inválida é pulada (fallback gracioso) sem
 * derrubar a geração. Resultado = array de {bytes, opts} para `composeArtwork`.
 */
async function loadFrames(
  db: SupabaseClient,
  frames: Frame[] | undefined,
): Promise<FrameLayer[]> {
  if (!frames?.length) return [];
  const layers: FrameLayer[] = [];
  for (const frame of frames) {
    const bytes = await loadFrameBytes(db, frame.path);
    if (bytes) layers.push({ bytes, opts: frameOpts(frame) });
  }
  return layers;
}

/**
 * Enquadramento do FUNDO a partir das options (defaults = cover fixo/centrado).
 * Espelha offset(MM)/scale/rotation da arte para o layer de fundo.
 */
function backgroundOpts(req: GenerateRequest): TransformOpts {
  return {
    offset: req.options.backgroundOffset ?? { x: 0, y: 0 },
    scale: req.options.backgroundScale ?? 1,
    rotation: req.options.backgroundRotation ?? 0,
  };
}

/** Rasteriza o PNG da arte a partir da origem já baixada (+ fundo/molduras opcionais). */
async function renderPrintPng(
  source: Uint8Array,
  layout: ArtLayout,
  req: GenerateRequest,
  backgroundBytes: Uint8Array | null,
  frames: FrameLayer[],
): Promise<Uint8Array> {
  const composedB64 = await composeArtwork(
    source,
    layout.artPx,
    layout.dpi,
    req.options,
    backgroundBytes,
    backgroundOpts(req),
    frames,
    // Toda moldura cobre o círculo VISÍVEL (corte), não a sangria → borda na
    // área de apresentação, igual ao preview do editor (paridade).
    layout.visiblePx,
  );
  const svg = buildLayoutSvg(
    layout,
    composedB64,
    req.options.background ?? "#ffffff",
    false,
    req.options.sequenceLabel,
  );
  return await rasterizeSvg(svg, layout.dpi);
}

/** Executa o pipeline completo e devolve os assets (print_png). */
export async function generateArtwork(
  db: SupabaseClient,
  jobId: string,
  spec: PrintSpec,
  req: GenerateRequest,
): Promise<AssetResult[]> {
  const layout = computeLayout(spec);
  const sourcePath = await fetchUploadPath(db, req.upload_id);
  const source = await downloadSource(db, sourcePath);
  const backgroundBytes = await loadBackgroundImage(
    db,
    req.options.backgroundImage,
  );
  const frames = await loadFrames(db, req.options.frames);
  const printPng = await renderPrintPng(
    source,
    layout,
    req,
    backgroundBytes,
    frames,
  );
  return [
    await storeAsset(
      db,
      jobId,
      "print.png",
      "print_png",
      printPng,
      "image/png",
      layout,
    ),
  ];
}
