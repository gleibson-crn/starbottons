# ADR-028: Numeração sequencial do botton na sangria

## Status

accepted

> **Emenda (ADR-029):** o ADR-029 troca a numeração AUTOMÁTICA (1..N por ordem de upload) por numeração MANUAL (`seqLabel` editável por item) e adiciona o contador de evento. Ver [ADR-029](ADR-029-numero-manual-e-contador-de-evento.md). Permanecem válidos aqui: o render na sangria, `options.sequenceLabel` e a Edge "burra". Os trechos sobre "começa em 1 / atribuído na ordem de upload" e `sequenceNumber` estão superados.

## Context

Em eventos (casamentos etc.) o dono quer numerar cada botton (senha/ticket) para saber qual botton é de qual convidado. O número deve ser impresso na SANGRIA: a área morta entre o círculo visível/corte e a borda da arte, que dobra para trás e não aparece na face. Posição: embaixo (6h).

Restrição técnica: a arte é um SVG rasterizado por resvg-wasm na Edge (`generate-art/svg.ts`), que NÃO tem fontes de sistema. Logo, `<text>` não renderiza.

## Decision

- **Só número sequencial** (MVP). Sem prefixo nem texto livre; isso fica para a fase 2.
- **Por imagem/item**: um botton físico = 1 número. Se o item gera vários tamanhos, todos levam o MESMO número.
- **Começa em 1, atribuído na ordem de upload, NÃO renumera.** Remover um item deixa um "buraco". É o comportamento seguro para o controle, pois o ticket impresso não muda.
- **Render**: nova camada `numberLabel` em `generate-art/svg.ts`, inserida DEPOIS do `bleedLightenRing` e ANTES do `cutLine`.
  - Fica na faixa entre `visibleRadiusPx` e `artCenter`, centrada embaixo (y ≈ `artPx − bleedPx/2`).
  - Altura ≈ 50-60% de `bleedPx`, cor escura (#111), legível sobre o clareamento da sangria.
  - Os dígitos são **vetor próprio** (estilo 7-segmentos: retângulos/paths por dígito 0-9), pois não há fonte disponível.
  - Nunca invade o círculo visível.
- **Contrato**: `options.sequenceLabel: string | null`. A Edge recebe a string JÁ FORMATADA e só desenha (Edge "burra"). `normalizeOptions` (`http.ts`) sanitiza: só dígitos no MVP, máx. ~8. O cliente monta `sequenceLabel = numbered ? String(item.sequenceNumber) : null`.
- **Prévia**: o número aparece só na arte de impressão (a sangria é área morta na face). No card do lote há um badge informativo "Nº N".

## Alternatives considered

### Alt A: `<text>` SVG com fonte TTF embutida (base64, como os WASMs)
**Pros**: permite texto livre e prefixos (fase 2).
**Cons**: mais pesado e frágil; o MVP numérico não precisa.
**rejection_reason**: adiado para a fase 2 (texto livre).

### Alt B: Carimbar o número no CLIENTE (canvas) após gerar
**Pros**: não depende de fonte na Edge.
**Cons**: duplica a geometria de layout (sangria/corte) que já vive na Edge.
**rejection_reason**: risco de divergência entre cliente e impressão.

### Alt C: Passar o ÍNDICE à Edge e ela formatar o rótulo
**Pros**: cliente mais simples.
**Cons**: a Edge passa a conhecer regra de formatação.
**rejection_reason**: mantemos a Edge burra; ela recebe a string pronta.

## Consequences

**Positivas**
- Controle de evento sem app externo.
- Render único na Edge: o que o cliente vê e o que imprime batem.

**Negativas/neutras**
- A fonte própria cobre só dígitos; texto livre exige fase 2 com fonte embutida.
- Em tamanhos pequenos a sangria é fina e o glifo fica minúsculo (escalar ao `bleedPx`).
- O número gasta um pouco de tinta na sangria clareada (aceitável).

**Testes exigidos (Deno)**
- O número cai ENTRE `visibleRadiusPx` e `artCenter`, nunca dentro do visível.
- `normalizeOptions` copia e sanitiza `sequenceLabel`.
- Sem label, nada é desenhado.
