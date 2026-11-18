import type { CutoutRequest, CutoutResponse } from './cutout.worker';

/** Mensagem exibida quando o worker/modelo não carrega (sem fallback síncrono). */
export const CUTOUT_LOAD_ERROR = 'Não foi possível carregar o removedor de fundo.';

/**
 * Teto anti-HANG (como `run-style-pass`): um worker de módulo que falha ao
 * carregar nem sempre dispara `onerror`. A inferência WASM single-thread do
 * ISNet fp16 leva dezenas de segundos em CPU lenta, daí o teto folgado.
 */
export const CUTOUT_TIMEOUT_MS = 240000;

/** Lado máximo da saída (= teto do upload tratado, `TREATED_MAX_SIDE`). */
export const CUTOUT_OUTPUT_MAX_SIDE = 1280;

export type CutoutStage = 'loading' | 'running';

export interface RunCutoutOptions {
  readonly signal?: AbortSignal;
  readonly onStage?: (stage: CutoutStage) => void;
}

function assetUrl(path: string): string {
  return new URL(path, document.baseURI).href;
}

function canRun(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap === 'function'
  );
}

/** Erro de carga com o detalhe técnico entre parênteses. */
function loadError(detail: string): Error {
  return new Error(`${CUTOUT_LOAD_ERROR} (${detail})`);
}

/**
 * runCutout — recorta o fundo da foto no navegador (ISNet em Web Worker).
 * Devolve RGBA cujo alfa é o matte do modelo (ainda sem o filtro de
 * componentes: ver `keepMainComponents`). Rejeita com `CUTOUT_LOAD_ERROR` se o
 * worker/modelo falhar ou estourar o timeout; rejeita com `AbortError` ao cancelar.
 */
export async function runCutout(
  source: ImageBitmapSource,
  options: RunCutoutOptions = {},
): Promise<ImageData> {
  if (!canRun()) {
    throw loadError('Web Worker/OffscreenCanvas indisponível');
  }
  const bitmap = await createImageBitmap(source);
  const worker = new Worker(new URL('./cutout.worker', import.meta.url), { type: 'module' });
  try {
    return await request(worker, bitmap, options);
  } finally {
    worker.terminate();
  }
}

/** Uma rodada de mensagem com o worker (timeout + abort). */
function request(worker: Worker, bitmap: ImageBitmap, options: RunCutoutOptions): Promise<ImageData> {
  return new Promise<ImageData>((resolve, reject) => {
    const timer = setTimeout(() => reject(loadError('tempo esgotado')), CUTOUT_TIMEOUT_MS);
    const finish = (fn: () => void): void => {
      clearTimeout(timer);
      fn();
    };
    options.signal?.addEventListener('abort', () =>
      finish(() => reject(new DOMException('Cancelado', 'AbortError'))),
    );
    worker.onmessage = (e: MessageEvent<CutoutResponse>) => {
      const msg = e.data;
      if (msg.kind === 'stage') {
        options.onStage?.(msg.stage);
      } else if (msg.kind === 'done') {
        finish(() => resolve(msg.imageData));
      } else {
        finish(() => reject(loadError(msg.message)));
      }
    };
    worker.onerror = (e) => finish(() => reject(loadError(e.message || 'falha no worker')));
    const req: CutoutRequest = {
      source: bitmap,
      maxSide: CUTOUT_OUTPUT_MAX_SIDE,
      modelUrl: assetUrl('models/isnet-general-use-fp16.onnx'),
      wasmUrl: assetUrl('ort/ort-wasm-simd-threaded.wasm'),
    };
    worker.postMessage(req, [bitmap]);
  });
}
