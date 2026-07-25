/**
 * Embute o PNG da arte num PDF de página única com dimensão FÍSICA correta.
 * A página mede exatamente art_diameter_mm convertido a pt (mm/25.4*72), de
 * modo que o PDF impresso em 100% saia no tamanho real do botton (ADR-004).
 */

import { PDFDocument } from "./deps.ts";
import type { ArtLayout } from "./types.ts";

/**
 * @param artPng  PNG RGBA da arte (já na dpi_target).
 * @param layout  fornece a dimensão física da página em pt.
 * @returns bytes do PDF.
 */
export async function buildPrintPdf(
  artPng: Uint8Array,
  layout: ArtLayout,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([layout.artWidthPt, layout.artHeightPt]);
  const embedded = await doc.embedPng(artPng);
  page.drawImage(embedded, {
    x: 0,
    y: 0,
    width: layout.artWidthPt,
    height: layout.artHeightPt,
  });
  return await doc.save();
}
