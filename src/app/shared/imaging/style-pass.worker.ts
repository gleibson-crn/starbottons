import type { ImageFilters, StyleEffect } from '../types';
import { filterString, isDefaultStyle } from '../types';
import { applyStyleEffect } from './apply-style-effect';

/** Mensagem enviada ao worker: fonte + tonal + estilo + resolução de trabalho. */
export interface StylePassRequest {
  readonly source: ImageBitmap;
  readonly filters: ImageFilters;
  readonly style: StyleEffect;
  readonly workingSide: number;
}

/** Resposta do worker: a arte já estilizada como ImageData. */
export interface StylePassResponse {
  readonly imageData: ImageData;
}

/**
 * Web Worker do style pass full-res (ADR-019): roda o tonal (`ctx.filter` num
 * OffscreenCanvas) + `applyStyleEffect` fora da thread principal, evitando
 * travar a UI no bake. Espelha `prepareArt` — a paridade vem de compartilharem
 * a MESMA `applyStyleEffect` pura. Devolve o ImageData estilizado (transferido).
 */
function handle(req: StylePassRequest): void {
  const { source, filters, style, workingSide } = req;
  const scale = workingSide / Math.max(source.width, source.height);
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('OffscreenCanvas 2D indisponível no worker.');
  }
  const css = filterString(filters);
  if (css) {
    ctx.filter = css;
  }
  ctx.drawImage(source, 0, 0, w, h);
  ctx.filter = 'none';
  const raw = ctx.getImageData(0, 0, w, h);
  const imageData = isDefaultStyle(style)
    ? raw
    : applyStyleEffect(raw, style, Math.max(w, h));
  source.close();
  const response: StylePassResponse = { imageData };
  (postMessage as (msg: StylePassResponse, transfer: Transferable[]) => void)(response, [
    imageData.data.buffer,
  ]);
}

addEventListener('message', (event: MessageEvent) => handle(event.data as StylePassRequest));
