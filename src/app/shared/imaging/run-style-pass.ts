import type { ImageFilters, StyleEffect } from '../types';
import { prepareArt, type CanvasFactory, type PreparedArt } from './prepare-art';
import type { StylePassRequest, StylePassResponse } from './style-pass.worker';

/** Lado a partir do qual vale a pena offloadar o pass para o worker. */
const WORKER_MIN_SIDE = 640;

/**
 * Teto de espera pelo worker antes de cair para a main thread. Rede de segurança
 * contra HANG: um worker de módulo que falha ao carregar nem sempre dispara
 * `onerror`, deixando a Promise pendente para sempre (geração presa em
 * "gerando"). As funções puras rodam em <1s neste teto de resolução, então o
 * fallback síncrono é barato e o timeout é folgado (só pega travas reais).
 */
const WORKER_TIMEOUT_MS = 15000;

/** `true` quando o ambiente suporta offload (worker + OffscreenCanvas + bitmap). */
function canOffload(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap === 'function'
  );
}

/**
 * runStylePass — executa o style pass devolvendo um canvas estilizado. Para
 * `workingSide` grande (bake/sprite), OFFLOADA ao Web Worker (OffscreenCanvas),
 * evitando travar a UI; caso contrário — ou quando o ambiente não suporta
 * worker (ex.: testes) — roda `prepareArt` SÍNCRONO na thread principal. Ambos
 * os caminhos compartilham a MESMA `applyStyleEffect`, então o resultado é
 * idêntico (paridade preview↔bake).
 */
export async function runStylePass(
  source: PreparedArt,
  filters: ImageFilters,
  style: StyleEffect,
  workingSide: number,
  createCanvas: CanvasFactory = () => document.createElement('canvas'),
): Promise<HTMLCanvasElement> {
  if (workingSide < WORKER_MIN_SIDE || !canOffload()) {
    return prepareArt(source, filters, style, workingSide, createCanvas);
  }
  try {
    return await offloadToWorker(source, filters, style, workingSide, createCanvas);
  } catch {
    return prepareArt(source, filters, style, workingSide, createCanvas);
  }
}

/** Roda o pass no worker e materializa o resultado num canvas. */
async function offloadToWorker(
  source: PreparedArt,
  filters: ImageFilters,
  style: StyleEffect,
  workingSide: number,
  createCanvas: CanvasFactory,
): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(source as ImageBitmapSource);
  const worker = new Worker(new URL('./style-pass.worker', import.meta.url), {
    type: 'module',
  });
  try {
    const data = await request(worker, { source: bitmap, filters, style, workingSide });
    return toCanvas(data.imageData, createCanvas);
  } finally {
    worker.terminate();
  }
}

/** Promise de uma única rodada de mensagem com o worker (com timeout anti-hang). */
function request(worker: Worker, req: StylePassRequest): Promise<StylePassResponse> {
  return new Promise<StylePassResponse>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('style-pass worker: timeout (sem resposta)')),
      WORKER_TIMEOUT_MS,
    );
    worker.onmessage = (e: MessageEvent<StylePassResponse>) => {
      clearTimeout(timer);
      resolve(e.data);
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      reject(new Error(e.message));
    };
    worker.postMessage(req, [req.source]);
  });
}

/** Escreve o ImageData estilizado num novo canvas. */
function toCanvas(data: ImageData, createCanvas: CanvasFactory): HTMLCanvasElement {
  const canvas = createCanvas();
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D indisponível para o resultado do style pass.');
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}
