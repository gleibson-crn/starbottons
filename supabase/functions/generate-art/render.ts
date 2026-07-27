/**
 * Orquestra o pipeline de arte de impressão (ADR-001/004):
 * origem → compõe (cover/scale/rotation/offset) → SVG de layout → PNG@dpi →
 * PDF físico → grava em renders/ → registra assets → assina URLs.
 */

import { decodeImage, Image, type SupabaseClient } from "./deps.ts";
import { encodeBase64 } from "@std/encoding/base64";
import { composeArtwork } from "./image.ts";
import { assertSafeSource } from "./image-header.ts";
import { type BackgroundImage, buildLayoutSvg } from "./svg.ts";
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
 * Baixa a imagem de fundo (path no bucket uploads) e devolve base64 + mime,
 * SEMPRE como PNG: o resvg-wasm não decodifica JPEG no `<image href>` (a
 * rasterização travava), então um fundo JPEG é decodificado e reencodado em PNG
 * aqui. PNG segue direto (fast path). Fallback gracioso: qualquer falha
 * (download/assinatura/teto de MP/decode) loga e retorna null → a composição
 * cai só na cor de fundo, sem quebrar a geração.
 */
async function loadBackgroundImage(
  db: SupabaseClient,
  path: string | null | undefined,
): Promise<BackgroundImage | null> {
  if (!path) return null;
  try {
    const bytes = await downloadSource(db, path);
    const { mime } = assertSafeSource(bytes); // valida magic bytes + teto de MP
    if (mime === "image/jpeg") {
      const decoded = (await decodeImage(bytes)) as Image;
      const png = await decoded.encode();
      return { b64: encodeBase64(png), mime: "image/png" };
    }
    return { b64: encodeBase64(bytes), mime };
  } catch (err) {
    console.error(
      "[generate-art] fundo de imagem indisponível, usando cor:",
      err,
    );
    return null;
  }
}

/** Rasteriza o PNG da arte a partir da origem já baixada. */
async function renderPrintPng(
  source: Uint8Array,
  layout: ArtLayout,
  req: GenerateRequest,
  backgroundImage: BackgroundImage | null,
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
    backgroundImage,
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
  const backgroundImage = await loadBackgroundImage(
    db,
    req.options.backgroundImage,
  );
  const printPng = await renderPrintPng(source, layout, req, backgroundImage);
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
