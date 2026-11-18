/**
 * Web Worker do "Remover fundo": ISNet general-use (fp16) via onnxruntime-web
 * (WASM SIMD, 1 thread) + OffscreenCanvas. Tudo roda LOCALMENTE — o modelo e o
 * .wasm são servidos de `public/` (nunca CDN) e a foto não sai do navegador. O
 * ORT entra por import DINÂMICO aqui dentro, fora do bundle inicial.
 */

/** Lado quadrado de entrada do ISNet. */
export const CUTOUT_INPUT_SIDE = 1024;

/** Pedido: foto + lado máximo da saída + URLs absolutas dos assets locais. */
export interface CutoutRequest {
  readonly source: ImageBitmap;
  readonly maxSide: number;
  readonly modelUrl: string;
  readonly wasmUrl: string;
}

/** Mensagens do worker → main. `imageData` = RGBA com alfa = matte (suave). */
export type CutoutResponse =
  | { readonly kind: 'stage'; readonly stage: 'loading' | 'running' }
  | { readonly kind: 'done'; readonly imageData: ImageData }
  | { readonly kind: 'error'; readonly message: string };

type Ort = typeof import('onnxruntime-web/wasm');
type Session = import('onnxruntime-web/wasm').InferenceSession;

function post(msg: CutoutResponse, transfer: Transferable[] = []): void {
  (postMessage as (m: CutoutResponse, t: Transferable[]) => void)(msg, transfer);
}

function canvas2d(w: number, h: number): OffscreenCanvasRenderingContext2D {
  const ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('OffscreenCanvas 2D indisponível no worker.');
  }
  return ctx;
}

async function loadSession(ort: Ort, req: CutoutRequest): Promise<Session> {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: req.wasmUrl };
  const res = await fetch(req.modelUrl);
  if (!res.ok) {
    throw new Error(`modelo indisponível (HTTP ${res.status})`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
}

/** RGBA 1024² → tensor CHW float32, `pixel / max(pixel) - 0.5` (convenção do modelo). */
function toInputTensor(rgba: Uint8ClampedArray): Float32Array {
  const plane = CUTOUT_INPUT_SIDE * CUTOUT_INPUT_SIDE;
  let max = 1;
  for (let p = 0; p < plane; p++) {
    max = Math.max(max, rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]);
  }
  const out = new Float32Array(3 * plane);
  for (let p = 0; p < plane; p++) {
    out[p] = rgba[p * 4] / max - 0.5;
    out[plane + p] = rgba[p * 4 + 1] / max - 0.5;
    out[2 * plane + p] = rgba[p * 4 + 2] / max - 0.5;
  }
  return out;
}

/** Saída 1 canal → alfa 0..255 min-max normalizado, em ImageData 1024². */
function matteImageData(raw: Float32Array): ImageData {
  let min = Infinity;
  let max = -Infinity;
  for (const v of raw) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const range = max - min || 1;
  const px = new Uint8ClampedArray(raw.length * 4);
  for (let p = 0; p < raw.length; p++) {
    px[p * 4 + 3] = Math.round(((raw[p] - min) / range) * 255);
  }
  return new ImageData(px, CUTOUT_INPUT_SIDE, CUTOUT_INPUT_SIDE);
}

async function inferMatte(session: Session, ort: Ort, source: ImageBitmap): Promise<ImageData> {
  const ctx = canvas2d(CUTOUT_INPUT_SIDE, CUTOUT_INPUT_SIDE);
  ctx.drawImage(source, 0, 0, CUTOUT_INPUT_SIDE, CUTOUT_INPUT_SIDE);
  const input = toInputTensor(ctx.getImageData(0, 0, CUTOUT_INPUT_SIDE, CUTOUT_INPUT_SIDE).data);
  const tensor = new ort.Tensor('float32', input, [1, 3, CUTOUT_INPUT_SIDE, CUTOUT_INPUT_SIDE]);
  const results = await session.run({ [session.inputNames[0]]: tensor });
  return matteImageData(results[session.outputNames[0]].data as Float32Array);
}

/** Foto reduzida a `maxSide` + alfa = matte reescalado (suavizado) → RGBA final. */
function composeCutout(source: ImageBitmap, matte: ImageData, maxSide: number): ImageData {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const colorCtx = canvas2d(w, h);
  colorCtx.drawImage(source, 0, 0, w, h);
  const color = colorCtx.getImageData(0, 0, w, h);
  const matteCtx = canvas2d(CUTOUT_INPUT_SIDE, CUTOUT_INPUT_SIDE);
  matteCtx.putImageData(matte, 0, 0);
  const scaledCtx = canvas2d(w, h);
  scaledCtx.imageSmoothingQuality = 'high';
  scaledCtx.drawImage(matteCtx.canvas, 0, 0, w, h);
  const alpha = scaledCtx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < color.data.length; i += 4) {
    color.data[i] = alpha[i];
  }
  return color;
}

async function handle(req: CutoutRequest): Promise<void> {
  try {
    post({ kind: 'stage', stage: 'loading' });
    const ort = await import('onnxruntime-web/wasm');
    const session = await loadSession(ort, req);
    post({ kind: 'stage', stage: 'running' });
    const matte = await inferMatte(session, ort, req.source);
    const imageData = composeCutout(req.source, matte, req.maxSide);
    req.source.close();
    post({ kind: 'done', imageData }, [imageData.data.buffer]);
  } catch (err) {
    post({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

addEventListener('message', (event: MessageEvent) => void handle(event.data as CutoutRequest));
