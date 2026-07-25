/**
 * Orquestra o pipeline de arte de impressão (ADR-001/004):
 * origem → compõe (cover/scale/rotation/offset) → SVG de layout → PNG@dpi →
 * PDF físico → grava em renders/ → registra assets → assina URLs.
 */

import { type SupabaseClient } from "./deps.ts";
import { composeArtwork } from "./image.ts";
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

/** Rasteriza o PNG da arte a partir da origem já baixada. */
async function renderPrintPng(
  source: Uint8Array,
  layout: ArtLayout,
  req: GenerateRequest,
): Promise<Uint8Array> {
  const composedB64 = await composeArtwork(
    source,
    layout.artPx,
    layout.dpi,
    req.options,
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
  const printPng = await renderPrintPng(source, layout, req);
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
