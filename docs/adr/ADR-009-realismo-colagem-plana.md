# ADR-009: Realismo da composição por colagem plana + gloss/sombra

## Status

accepted

## Context

Definida a área-alvo (ADR-008), é preciso decidir **quanto realismo** a composição do mockup contextual persegue no v1 — ou seja, como a arte circular do botton é "encaixada" na cena para parecer um objeto físico ali. Botton é **redondo** e tem acabamento **brilhante (gloss)** e volume; uma colagem sem tratamento fica com cara de adesivo chapado.

A decisão é necessária agora porque determina o custo computacional do compositor e onde ele roda (ADR-010, client-side no v1). As forças: **qualidade percebida** suficiente para uso comercial interno, **baixo custo/memória** compatível com Canvas 2D no browser, **baixo risco de artefato** e prazo de MVP. Técnicas de perspectiva (warp por homografia) e relighting elevam muito a qualidade mas também o custo, a memória e o risco de artefatos visíveis quando mal calibradas.

## Alternatives considered

### Alt 1 (escolhida): Colagem plana + gloss/sombra do mockup + sombra de contato + iluminação multiply-soft opcional

**Pros**:
- **Baixo custo e memória** — compatível com Canvas 2D no client (ADR-010), sem WASM/warp.
- Ganho de realismo **barato e previsível**: overlay de **gloss** e **sombra do mockup** dão o volume/brilho do botton; **sombra de contato** ancora o objeto na cena; **multiply-soft opcional** integra a iluminação sem escurecer demais.
- **Baixo risco de artefato**: sem deformação geométrica, não há esticões/serrilhados de warp.

**Cons**:
- Sem **perspectiva**: em cenas muito anguladas, o botton parece frontal demais.
- Sem **relight** real: a integração de luz é aproximada (overlay), não fisicamente correta.

**Rejection reason** *(não se aplica — alternativa escolhida)*.

### Alt 2: Warp por homografia/perspectiva + relight

**Pros**:
- Realismo superior: o botton acompanha o ângulo/superfície da cena.
- Relight integra sombras/reflexos de forma mais convincente.

**Cons**:
- **Alto custo de CPU/memória** — pesado para Canvas 2D no browser.
- **Risco de artefato** (esticões, aliasing, halos de relight) quando a calibração do plano/luz erra.
- Complexidade de implementação e teste desproporcional ao MVP.

**Rejection reason**: Custo/memória e risco de artefato incompatíveis com o v1 client-side; **adiado para v2**, provavelmente junto de processamento server-side (ADR-010).

### Alt 3: Colagem plana pura (sem gloss/sombra)

**Pros**:
- Implementação trivial e a mais barata possível.

**Cons**:
- Resultado com cara de **adesivo chapado**, sem volume nem ancoragem — qualidade percebida baixa.

**Rejection reason**: Qualidade insuficiente para uso comercial; o incremento de gloss/sombra da Alt 1 é barato e resolve o principal defeito.

## Decision

O v1 usa **colagem plana (sem perspectiva)** acrescida de **gloss e sombra do mockup**, **sombra de contato** e **iluminação multiply-soft opcional**. **Warp por homografia/perspectiva e relight ficam adiados para o v2.**

## Consequences

### Positive
- Realismo adequado ao uso comercial interno a baixo custo e sem artefatos geométricos.
- Roda confortavelmente em Canvas 2D no client (ADR-010).

### Negative
- Cenas muito anguladas mostram o botton frontal demais; integração de luz é aproximada.

### Neutral
- **Gatilho para reabrir**: **warp + relight (Alt 2)** entram no v2, coerentes com a possível migração para processamento server-side descrita no ADR-010.
- A qualidade final depende diretamente da geometria-alvo marcada no ADR-008.
