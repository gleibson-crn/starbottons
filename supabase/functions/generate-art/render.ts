/**
 * Orquestra o pipeline de arte de impressão (ADR-001/004):
 * origem → compõe (cover/scale/rotation/offset) → SVG de layout → PNG@dpi →
 * PDF físico → grava em renders/ → registra assets → assina URLs.
 */

import { type SupabaseClient } from "./deps.ts";
import { composeArtwork } from "./image.ts";
import { assertSafeSource } from "./image-header.ts";
import { buildLayoutSvg } from "./svg.ts";
import { rasterizeSvg } from "./raster.ts";
import { buildPrintPdf } from "./pdf.ts";
import { computeLayout } from "./geometry.ts";
import {
  downloadSource,
  fetchUploadPath,
  signRender,
  uploadRender,
} from "./db.ts";
import { insertAsset } from "./jobs.ts";
import type {
  ArtLayout,
  AssetResult,
  GenerateRequest,
  PrintSpec,
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

/** Rasteriza o PNG da arte a partir da origem já baixada (+ fundo opcional). */
async function renderPrintPng(
  source: Uint8Array,
  layout: ArtLayout,
  req: GenerateRequest,
  backgroundBytes: Uint8Array | null,
): Promise<Uint8Array> {
  const composedB64 = await composeArtwork(
    source,
    layout.artPx,
    layout.dpi,
    req.options,
    backgroundBytes,
  );
  const svg = buildLayoutSvg(
    layout,
    composedB64,
    req.options.background ?? "#ffffff",
  );
  return await rasterizeSvg(svg, layout.dpi);
}

/** Executa o pipeline completo e devolve os assets (print_png + print_pdf). */
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
  const printPng = await renderPrintPng(source, layout, req, backgroundBytes);
  const printPdf = await buildPrintPdf(printPng, layout);
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
    await storeAsset(
      db,
      jobId,
      "print.pdf",
      "print_pdf",
      printPdf,
      "application/pdf",
      layout,
    ),
  ];
}
