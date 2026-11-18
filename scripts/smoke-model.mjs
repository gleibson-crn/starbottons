#!/usr/bin/env node
/**
 * smoke-model — confere que o .onnx local carrega e roda uma inferência 1024x1024
 * (tensor dummy) com o onnxruntime-web (WASM, 1 thread). Uso: `npm run models:smoke`.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ort from 'onnxruntime-web/wasm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const modelPath = join(ROOT, 'public', 'models', 'isnet-general-use-fp16.onnx');

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmBinary = new Uint8Array(
  await readFile(join(ROOT, 'public', 'ort', 'ort-wasm-simd-threaded.wasm')),
);

const t0 = performance.now();
const bytes = await readFile(modelPath);
const session = await ort.InferenceSession.create(new Uint8Array(bytes), {
  executionProviders: ['wasm'],
});
console.log('inputs :', session.inputNames, 'outputs:', session.outputNames);
const meta = session.inputMetadata?.[session.inputNames[0]];
console.log('input meta:', JSON.stringify(meta));
const side = 1024;
const data = new Float32Array(3 * side * side).fill(0.1);
const t1 = performance.now();
const out = await session.run({
  [session.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, side, side]),
});
const first = out[session.outputNames[0]];
console.log('output dims:', first.dims, 'type:', first.type, 'len:', first.data.length);
console.log(
  `OK — carga ${(t1 - t0).toFixed(0)}ms, inferência ${(performance.now() - t1).toFixed(0)}ms`,
);
