#!/usr/bin/env node
/**
 * fetch-models — prepara os assets LOCAIS do "Remover fundo" (100% no navegador).
 *
 *  1. Baixa o modelo ISNet general-use (fp16) para public/models/ e VERIFICA o
 *     SHA-256 (idempotente: se o arquivo já existe com o hash certo, não baixa).
 *  2. Copia o .wasm do onnxruntime-web (pacote npm, versão pinada) para public/ort/.
 *
 * Tudo é servido do próprio app (public/**) — NUNCA de CDN (o Avast quebra
 * download de asset em runtime). Uso: `npm run models:fetch`.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Modelo: ISNet general-use fp16 (DIS, Apache-2.0; export rembg, MIT). */
const MODEL = {
  name: 'isnet-general-use-fp16.onnx',
  dir: join(ROOT, 'public', 'models'),
  sha256: '1e00f2f0b23dea1b687ff90652263144fdb98af942aaa0cae8630c49159b18f0',
  size: 90661254,
  urls: [
    'https://huggingface.co/tiper-penta/isnet-general-use-fp16/resolve/main/isnet-general-use-fp16.onnx',
  ],
};

/** WASM do ORT (vem do pacote npm; o glue JS já vai embutido no bundle do worker). */
const ORT_WASM = {
  name: 'ort-wasm-simd-threaded.wasm',
  from: join(ROOT, 'node_modules', 'onnxruntime-web', 'dist', 'ort-wasm-simd-threaded.wasm'),
  dir: join(ROOT, 'public', 'ort'),
};

function sha256Of(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (c) => hash.update(c))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

async function downloadVerified(url, dest, expectedSha) {
  const tmp = `${dest}.part`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} em ${url}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  const got = await sha256Of(tmp);
  if (got !== expectedSha) {
    await rm(tmp, { force: true });
    throw new Error(`SHA-256 divergente (esperado ${expectedSha}, obtido ${got}).`);
  }
  await rename(tmp, dest);
}

async function fetchModel() {
  await mkdir(MODEL.dir, { recursive: true });
  const dest = join(MODEL.dir, MODEL.name);
  if (existsSync(dest) && (await sha256Of(dest)) === MODEL.sha256) {
    console.log(`[ok] ${MODEL.name} já presente e verificado (SHA-256).`);
    return true;
  }
  for (const url of MODEL.urls) {
    try {
      console.log(`[..] baixando ${url} (~${Math.round(MODEL.size / 1048576)}MB)`);
      await downloadVerified(url, dest, MODEL.sha256);
      console.log(`[ok] ${MODEL.name} baixado e verificado (SHA-256).`);
      return true;
    } catch (err) {
      console.error(`[erro] ${err.message}`);
    }
  }
  console.error(
    `[FALHOU] não foi possível obter ${MODEL.name}. Se o Avast/rede bloqueou, ` +
      `baixe manualmente de ${MODEL.urls[0]} para ${MODEL.dir} e rode de novo (o hash é conferido).`,
  );
  return false;
}

async function copyOrtWasm() {
  if (!existsSync(ORT_WASM.from)) {
    console.error('[FALHOU] onnxruntime-web não instalado — rode `npm install` antes.');
    return false;
  }
  await mkdir(ORT_WASM.dir, { recursive: true });
  const dest = join(ORT_WASM.dir, ORT_WASM.name);
  const src = await stat(ORT_WASM.from);
  if (existsSync(dest) && (await stat(dest)).size === src.size) {
    console.log(`[ok] ${ORT_WASM.name} já presente em public/ort/.`);
    return true;
  }
  await copyFile(ORT_WASM.from, dest);
  console.log(`[ok] ${ORT_WASM.name} copiado para public/ort/.`);
  return true;
}

const wasmOk = await copyOrtWasm();
const modelOk = await fetchModel();
process.exit(wasmOk && modelOk ? 0 : 1);
