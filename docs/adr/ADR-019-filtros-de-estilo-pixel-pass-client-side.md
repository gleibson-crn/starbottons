# ADR-019: Filtros de estilo — estágio "style pass" por pixel, client-side e determinístico

## Status
proposed

## Context
Hoje os filtros do editor são exclusivamente CSS: `ImageFilters`
(brightness/contrast/saturate + effect grayscale/sepia) via `filterString()` e
`ctx.filter`, aplicados em dois pontos que garantem paridade — `drawArt()` em
`shared/ui/canvas-editor/botton-face.ts` (compartilhado por editor-render e
mockup-render) e `renderFilteredBlob()` em `core/upload/treated-image.ts` (bake
full-res→Edge, invariante do ADR-014). O produto quer efeitos de estilo
(posterização, detecção de borda/Sobel, quantização de k-cores, halftone) que
NÃO são expressáveis em `ctx.filter` — exigem processamento por pixel
(ImageData/convolução) num estágio offscreen antes da composição.

A decisão é necessária agora porque, sem um estágio dedicado, não há como manter
a invariante de paridade editor↔mockup↔bake que o ADR-014 estabeleceu para os
filtros tonais. Restrições: LOCAL-ONLY (nenhum egress); zoneless/OnPush com
preview reativo a cada gesto; o bake precisa preservar resolução (300 DPI, ADR-014);
não regredir o caminho tonal atual nem os golden tests de geometria.

## Alternatives considered

### Alt 1 (escolhida): estágio "style pass" por pixel client-side, funções puras em shared, memoizado, com bake full-res no Web Worker
O estilo é aplicado num offscreen ANTES da composição, por funções puras
`ImageData→ImageData` em `shared/imaging/`. Um novo tipo `StyleEffect` (separado
de `ImageFilters`) modela o efeito. `prepareArt` (shared) é a fonte única do
estágio, chamada pelos 3 consumidores (editor, mockup, bake). O preview roda
síncrono em ≤520px, memoizado por (image,filters,style,side) para não recomputar
em drag/zoom. O bake full-res roda no worker (OffscreenCanvas). Quando
`style.kind==='none'`, o caminho atual (ctx.filter) fica intocado.
**Pros:** paridade por construção (mesma fn pura nos 3 pontos); ADR-014 preservado
como caso particular; zero dependência externa (respeita local-only); funções
puras testáveis por golden ImageData; geometria não recomputa o pass.
**Cons:** preview a baixa resolução é aproximação para halftone/edge; bake full-res
pode custar segundos (mitigado por worker); exige empacotar worker no build.

### Alt 2: reaplicar o estilo na Edge (ImageScript/WASM), enviando parâmetros
Client manda params, a Edge recompõe com estilo.
**Pros:** sem re-upload; sem worker no client.
**Cons:** reimplementar convolução/quantização em ImageScript/WASM (Deno) — o
worker da Edge já esbarra em limite de CPU (ver ADR-016/downscale ≤1000px);
risco de divergência preview↔arte (mesma classe de problema do ADR-014 Alt 2);
novos golden tests de cor na Edge; altera o contrato de generate-art.
**Rejection reason:** reintroduz divergência preview↔arte e sobrecarrega o worker
da Edge (limite de CPU já conhecido); custo/risco altos.

### Alt 3: sobrecarregar ImageFilters.effect com os novos estilos
Adicionar 'posterize'/'edge'/... ao union ImageEffect existente.
**Pros:** um só tipo de "tratamento".
**Cons:** vaza valores não-CSS para filterString/effectSuffix; quebra a semântica
CSS-pura de ImageFilters e a invariante tonal do ADR-014; acopla dois estágios
com custos e resoluções muito diferentes.
**Rejection reason:** mistura um estágio CSS-puro barato com um estágio por-pixel
caro; corrompe filterString e o contrato tonal do ADR-014.

## Decision
Introduzimos um estágio "style pass" por pixel, 100% client-side, modelado por um
tipo NOVO `StyleEffect` (separado de `ImageFilters`, que fica INALTERADO). As
funções são PURAS (`ImageData→ImageData`) e moram em `shared/imaging/`;
`applyStyleEffect` é o dispatcher. `prepareArt` (shared, com CanvasFactory
injetável) é a FONTE ÚNICA do estágio, consumida pelos três renderizadores
(editor-render, mockup-render e o bake `treated-image`), garantindo paridade por
construção. A ordem de composição é tonal (ctx.filter) → style pass → composição.
Quando `style.kind==='none'`, o caminho atual permanece idêntico (ADR-014
preservado como caso particular). Algoritmos são DETERMINÍSTICOS (quantização por
median-cut, nunca k-means aleatório) para que preview e bake produzam os mesmos
pixels. Parâmetros resolution-dependent (halftone, edge) são normalizados (fração
do diâmetro) e escalados por resolução. O preview roda síncrono a ≤520px e
memoizado por (image,filters,style,side); o bake full-res roda em Web Worker com
OffscreenCanvas. MVP: posterize, edge (Sobel), quantize (median-cut), halftone;
sketch stretch; aquarela adiada para v2.

## Consequences
### Positive
- Paridade preview↔mockup↔bake por construção (mesma função pura nos 3 pontos).
- ADR-014 preservado; caminho tonal e golden tests de geometria intactos.
- Zero dependência/egress — respeita LOCAL-ONLY.
- Funções puras determinísticas → testes golden estáveis; geometria não recomputa.
### Negative
- Preview em baixa resolução é aproximação para halftone/edge (fidelidade exata só
  em posterize/quantize) — exige aval do dono e aviso de UI.
- Bake full-res pode custar segundos (mitigado por worker + spinner).
- Requer empacotar Web Worker no build Angular/esbuild.
### Neutral
- StyleEffect é opt-in; ausência = comportamento atual.
- Aquarela e sketch avançado ficam para v2.
