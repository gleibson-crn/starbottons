# ADR-030: Removedor de fundo no navegador (ISNet Apache-2.0 + onnxruntime-web local)

## Status

accepted (decisão do dono; POC aprovada)

## Context

O dono quer que, ao subir a foto de uma pessoa no editor de bottons, um botão **"Remover fundo"** recorte a(s) pessoa(s) e deixe o resto transparente, para que a pessoa apareça sobre o fundo escolhido do botton (ADR-016). Uma POC foi feita e aprovada pelo dono.

Forças em jogo:

- **Privacidade e local-only:** o projeto é LOCAL-ONLY e a privacidade ("a foto nunca sai do PC") é argumento de venda. Nenhuma imagem pode trafegar pela rede. A Trilha 2 de IA (OpenAI, ADR-020/021) está desligada e **não deve ser religada**.
- **Licença comercial:** o dono VENDE os bottons. Qualquer modelo ou biblioteca precisa permitir uso comercial; licenças GPL/AGPL ou não-comerciais inviabilizam o produto.
- **Ambiente:** `ng serve` não envia COOP/COEP, logo não há `SharedArrayBuffer` (WASM single-thread). O dono tem Avast neste PC, e há precedente de o Avast quebrar download de asset em runtime (por isso a Edge `generate-art` embute WASM em base64). Assets precisam ser servidos localmente.
- **Padrões existentes:** o processamento pesado de imagem já roda em Web Worker com OffscreenCanvas (`src/app/shared/imaging/run-style-pass.ts` + `style-pass.worker.ts`, ADR-019), e há o precedente de fontes de geração alternativas (`aiStyled`/`generationUpload`).

## Alternatives considered

### Alt 1: ISNet general-use (DIS, Apache-2.0) + onnxruntime-web local — ESCOLHIDA
**Pros**:
- Licença Apache-2.0 (DIS, xuebinqin, ECCV 2022): uso comercial permitido.
- Mesma família (segmentação de objeto saliente) do modelo usado na POC aprovada pelo dono.
- `.onnx` fp16 de ~22 MB: viável no navegador; onnxruntime-web 1.31.1 é MIT.
- 100% local, offline após o primeiro carregamento, sem custo por imagem.

**Cons**:
- Zona cinzenta de licença do arquivo `.onnx` (ver Consequences).
- Segmentação saliente também recorta objetos em foco próximos à pessoa.
- Alguns segundos por foto na CPU (WASM SIMD single-thread).

**Rejection reason**: não se aplica (escolhida).

### Alt 2: BiRefNet (MIT) local
**Pros**:
- Licença MIT, juridicamente mais limpa.
- Qualidade de borda superior.

**Cons**:
- Bem mais pesado e lento no navegador (modelo maior, mais memória, sem GPU/threads no `ng serve`).

**Rejection reason**: peso e latência inadequados para WASM single-thread no navegador; o ganho jurídico não compensa a UX. Pode ser reavaliada se a zona cinzenta do ISNet virar problema.

### Alt 3: @imgly/background-removal
**Pros**:
- Pronta para uso, roda no navegador.

**Cons**:
- Licença GPL/AGPL, incompatível com a venda do produto.

**Rejection reason**: PROIBIDA — licença incompatível com uso comercial/distribuição.

### Alt 4: RMBG-1.4 / RMBG-2.0 (briaai)
**Pros**:
- Ótima qualidade de recorte.

**Cons**:
- Licença não-comercial.

**Rejection reason**: PROIBIDA — o dono vende os bottons, uso comercial vedado.

### Alt 5: IA via OpenAI na nuvem
**Pros**:
- Sem peso de modelo no cliente; sem processamento local.

**Cons**:
- Custo por imagem.
- A foto sairia do PC, quebrando a privacidade e o princípio local-only.
- Exigiria religar a Trilha 2 de IA, desligada por decisão.

**Rejection reason**: custo + quebra de privacidade/local-only.

## Decision

Implementar "Remover fundo" com **ISNet general-use (Apache-2.0)** executado por **onnxruntime-web 1.31.1 (MIT)**, WASM SIMD single-thread, dentro de um **Web Worker (OffscreenCanvas)** espelhando `run-style-pass.ts` + `style-pass.worker.ts`. O modelo (`.onnx` fp16 ~22 MB) e os `.wasm` do ORT são servidos **localmente a partir de `public/`**, nunca via CDN.

Detalhes:

- **Pós-processamento** (reaproveitado da POC): threshold de alfa (binariza a borda; slider "sensibilidade") + componentes conectados. **Mudança vs POC:** a POC mantinha só o maior componente; agora mantém o maior **e todo componente com área ≥ ~15% do maior** (cobre grupos de 2+ pessoas), descartando ilhas pequenas (reflexos, ruído).
- **Pipeline:** o recorte entra como nova fonte de geração do item, análoga a `aiStyled`/`generationUpload`, porém como **camada-fonte reajustável**: o upload ORIGINAL permanece intacto (permite desfazer/reajustar) e filtros/estilo **não** são zerados (diferente do `aiStyled`); continuam sendo aplicados sobre o recorte no bake. O **alfa é preservado** por todo o pipeline (bake + Edge `generate-art`).
- **Escopo MVP:** um recorte por item, no editor. "Remover fundo de todos (lote)" fica fora do MVP.
- **Risco jurídico aceito:** o `.onnx` é redistribuído pelo rembg (código MIT); os pesos vêm do DIS (Apache-2.0). Os mantenedores do rembg não declaram a licença do `.onnx` diretamente, então a atribuição Apache-2.0 repousa em redistribuidores downstream. **Mitigação:** `NOTICE`/`THIRD_PARTY_NOTICES` com atribuição ao DIS e link https://github.com/xuebinqin/DIS.

## Consequences

### Positive
- Uso comercial permitido (Apache-2.0 + MIT), compatível com a venda dos bottons.
- Privacidade preservada: nenhuma imagem sai do PC; coerente com local-only.
- Funciona offline após o primeiro carregamento; sem custo por imagem.
- Assets locais evitam a quebra de downloads em runtime pelo Avast.
- Reuso do padrão worker/OffscreenCanvas já validado; o original intacto permite desfazer.

### Negative
- Zona cinzenta de licença do `.onnx` (atribuição Apache-2.0 depende de redistribuidores downstream), aceita pelo dono e mitigada por NOTICE/THIRD_PARTY_NOTICES. Plano B: BiRefNet (MIT).
- Download inicial de ~22 MB (modelo) mais os `.wasm`, uma vez, depois em cache.
- Alguns segundos por foto na CPU (single-thread, sem `SharedArrayBuffer` no `ng serve`).
- A segmentação saliente recorta objetos em foco próximos à pessoa — comportamento conhecido e aceito.
- Manter todos os componentes ≥ ~15% do maior pode reter um objeto grande não desejado ou, inversamente, perder uma pessoa muito menor ao fundo; o slider de sensibilidade ameniza.

### Neutral
- Novos assets em `public/` (modelo + `.wasm`) e nova dependência `onnxruntime-web`.
- Alfa passa a ser requisito explícito em todo o pipeline de geração (bake + Edge).
- Remoção em lote fica como evolução futura.
