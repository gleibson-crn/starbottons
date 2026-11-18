# Avisos de terceiros (Third-Party Notices)

O Star Bottons inclui/usa os componentes abaixo na funcionalidade "Remover
fundo" (processada 100% no navegador do usuário; a foto não sai do PC). Todos
têm licença permissiva que autoriza uso comercial, desde que mantida a atribuição.

## IS-Net (DIS) — modelo `isnet-general-use`

- Origem: "Highly Accurate Dichotomous Image Segmentation" — Xuebin Qin et al.,
  ECCV 2022. https://github.com/xuebinqin/DIS
- Licença: **Apache License 2.0** — https://www.apache.org/licenses/LICENSE-2.0
- Arquivo usado: `public/models/isnet-general-use-fp16.onnx` (baixado por
  `npm run models:fetch`; SHA-256 conferido pelo script). É a conversão para
  float16 (sem retreino; saídas auxiliares removidas) do `isnet-general-use.onnx`
  distribuído pelo rembg, publicada em
  https://huggingface.co/tiper-penta/isnet-general-use-fp16 (Apache-2.0).
- Modificações: remoção das saídas auxiliares e conversão de pesos para fp16.

## rembg

- Origem: https://github.com/danielgatis/rembg — Daniel Gatis.
- Licença: **MIT**.
- Uso: fonte do export ONNX `isnet-general-use.onnx` de onde o modelo acima
  deriva (o rembg em si não é executado/distribuído por este projeto).

## ONNX Runtime Web (`onnxruntime-web` 1.31.1)

- Origem: https://github.com/microsoft/onnxruntime — Microsoft Corporation.
- Licença: **MIT**.
- Uso: runtime de inferência (WASM, single-thread) executado em Web Worker; o
  binário `ort-wasm-simd-threaded.wasm` é copiado do pacote npm para
  `public/ort/` e servido localmente (nunca de CDN).

---

Texto das licenças: Apache-2.0 (https://www.apache.org/licenses/LICENSE-2.0.txt)
e MIT (https://opensource.org/license/mit). Ao distribuir o produto, inclua este
arquivo e o `LICENSE` do modelo (Apache-2.0) junto ao artefato.
