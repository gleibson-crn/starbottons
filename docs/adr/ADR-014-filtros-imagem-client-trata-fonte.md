# ADR-014: Aplicação de filtros/tratamento de imagem — client trata a fonte em resolução plena

## Status

accepted

## Context

Uma nova feature de **tratamento básico de imagem** (brilho, contraste, saturação + presets **P&B**, **sépia**, **vívido**) foi adicionada ao **fluxo single**, dentro do **editor de ajuste**. O **preview** dos filtros é **client-side**, renderizado em **Canvas** via `ctx.filter`. A **arte final de impressão**, porém, é composta **server-side** na Edge Function `generate-art` (Deno + WASM/ImageScript, `image.ts::composeArtwork`), que **hoje NÃO faz ajuste de cor** — apenas recompõe geometria (enquadramento, sangria, disco).

A decisão é necessária **agora** porque, sem tratamento explícito, a **arte impressa não refletiria os filtros vistos no preview**: o usuário ajustaria brilho/contraste na tela, mas o botton sairia com as cores da imagem original. É preciso garantir **fidelidade preview↔arte** por construção, sem quebrar as validações e os golden tests existentes.

As forças em jogo: **garantir que os mesmos pixels do preview cheguem à impressão**; **preservar resolução para 300 DPI** (o preview de display tem dimensões menores que a fonte natural); **não regredir** as validações de upload (`magic-bytes`, teto de megapixels via `assertSafeSource`); **manter o contrato e os golden tests de geometria da Edge intactos**; e **evitar** reintroduzir a classe de divergência preview↔arte que já foi trabalhosa no enquadramento.

## Alternatives considered

### Alt 1 (escolhida): Client trata a fonte em resolução plena e re-sobe a imagem tratada

O client aplica os filtros na imagem de **ORIGEM em RESOLUÇÃO PLENA** — canvas **offscreen** nas **dimensões naturais** da fonte, não no tamanho de display —, **re-encoda em PNG lossless** e faz **upload da imagem já TRATADA** ao bucket `uploads` como um **novo `upload_id`**. A Edge `generate-art` permanece **inalterada**, recebendo a fonte tratada e apenas recompondo geometria. O **original é mantido** no bucket para permitir **"Redefinir filtros"**.

**Pros**:
- **Fidelidade preview↔arte por construção**: são **os mesmos pixels** (mesmo pipeline `ctx.filter`) que o usuário viu no preview.
- **Zero mudança na Edge** `generate-art` — sem tocar `composeArtwork` nem em WASM/ImageScript.
- **Reuso total** do pipeline de composição existente; **golden tests de geometria permanecem intactos** (não há golden test de cor a criar).
- Original preservado no bucket permite **desfazer/redefinir** filtros sem perda.

**Cons**:
- **Re-upload** de uma imagem tratada (custo de tamanho/banda), já que se sobe um novo PNG lossless.
- Exige cuidado para **preservar resolução** (renderizar no tamanho natural, não no display) e **re-encodar lossless**; a imagem tratada precisa **continuar passando** `magic-bytes` e o teto de megapixels (`assertSafeSource`).

**Rejection reason** *(não se aplica — alternativa escolhida)*.

### Alt 2: Passar parâmetros de filtro à Edge e ImageScript reaplicar

O client enviaria os **parâmetros** de filtro (brilho/contraste/saturação/preset) no `GenerateRequest`, e a Edge **reaplicaria** os ajustes por-pixel no **ImageScript** (Deno/WASM) durante a composição.

**Pros**:
- **Sem re-upload**: a fonte original permanece e só trafegam parâmetros leves.

**Cons**:
- Exige **implementar brilho/contraste/saturação/curvas por-pixel** no ImageScript (Deno/WASM) — trabalhoso e propenso a diferenças numéricas frente ao `ctx.filter` do Canvas.
- Demanda **novos golden tests de COR** na Edge, além dos de geometria.
- **Risco de divergência preview↔arte** (Canvas vs. ImageScript produzem resultados sutilmente diferentes) — **a mesma classe de problema** já custosa no enquadramento.
- Altera o **contrato** de `generate-art` (novos campos em `options`).

**Rejection reason**: Reintroduz o risco de divergência preview↔arte e obriga a reimplementar tratamento de cor no ImageScript com novos golden tests de cor — custo e risco altos para a **v1**. Fica registrada como **possível v2** caso o re-upload da Alt 1 se mostre gargalo.

## Decision

O **CLIENT** aplica os filtros na imagem de **origem em resolução plena** (canvas offscreen nas dimensões naturais), **re-encoda em PNG lossless** e **sobe a imagem tratada** ao bucket `uploads` como **novo `upload_id`**; a Edge `generate-art` fica **INALTERADA** (recebe a fonte tratada e só recompõe geometria). O **original é mantido** no bucket para permitir **"Redefinir filtros"**. A imagem tratada **continua passando** as validações existentes (`magic-bytes`, teto de megapixels/`assertSafeSource`) e **preserva resolução** para 300 DPI. Os filtros são **opt-in**: na **ausência** de filtros, o comportamento é **idêntico ao atual**.

## Consequences

### Positive
- **Fidelidade preview↔arte garantida por construção** (mesmos pixels do preview chegam à impressão).
- **Nenhuma mudança** no contrato de `generate-art` (`GenerateRequest`/`options`) nem em `composeArtwork`; **golden tests de geometria intactos**.
- **Reuso total** do pipeline de composição existente; original preservado permite **redefinir filtros** sem perda.

### Negative
- **Re-upload** de PNG lossless tratado (custo de tamanho/banda) e a necessidade de **cuidar de resolução/lossless** no client para não perder qualidade para 300 DPI.
- A imagem tratada precisa **revalidar** `magic-bytes` e teto de megapixels (`assertSafeSource`), como qualquer novo upload.

### Neutral
- **Filtros opt-in**: ausência de filtros = comportamento atual (contrato de `generate-art` inalterado).
- **Fora de escopo (v2)**: remoção de fundo, e filtros no **lote** e no **mockup**; reaplicação de parâmetros na Edge (Alt 2) fica como possível v2 se o re-upload virar gargalo.
