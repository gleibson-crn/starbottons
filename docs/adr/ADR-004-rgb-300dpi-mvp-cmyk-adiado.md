# ADR-004: RGB 300 DPI no MVP (CMYK/ICC adiado)

## Status

accepted

## Context

A arte final vai para uma gráfica de bottons e precisa de um espaço de cor e resolução definidos. Duas opções realistas: entregar em **RGB** ou em **CMYK com perfil ICC** real. A resolução alvo é 300 DPI para os tamanhos pequenos do MVP (32/44/58mm → ~378/520/685px).

A decisão precisa ser tomada agora porque ela determina a complexidade da infra de render. **CMYK real com perfil ICC** exige conversão colorimétrica correta (ex.: Ghostscript / LittleCMS), o que **não cabe** numa Edge Function em Deno + WASM e empurraria o projeto para um worker externo (justamente a Alt rejeitada no ADR-001) já no MVP.

Na prática, **a maioria das gráficas de botton aceita arquivos RGB 300 DPI** e faz a conversão CMYK internamente no RIP. Isso torna RGB uma escolha pragmática para validar o produto sem arrastar a complexidade de gestão de cor.

## Alternatives considered

### Alt 1 (escolhida): RGB 300 DPI (PNG + PDF) no MVP
**Pros**:
- Cabe na Edge Function (Deno + WASM) sem worker externo.
- Aceito pela maioria das gráficas de botton, que convertem no RIP.
- Entrega tanto **PNG** quanto **PDF** para cobrir os fluxos comuns de envio.

**Cons**:
- Sem controle colorimétrico fino: a cor final depende da conversão da gráfica.
- Pode haver desvio de cor se a gráfica específica do dono exigir CMYK/ICC.

**Rejection reason** *(não se aplica — alternativa escolhida)*.

### Alt 2: CMYK real com perfil ICC já no MVP
**Pros**:
- Controle colorimétrico preciso, previsível para qualquer gráfica.
- Evita retrabalho caso a gráfica exija CMYK.

**Cons**:
- Exige Ghostscript/LittleCMS num **worker externo** — infra e complexidade que o ADR-001 deliberadamente adiou.
- Gestão de perfis ICC (aquisição, versionamento, validação) é trabalho contínuo.
- Desproporcional para validar um MVP interno.

**Rejection reason**: Custo de infra e de gestão de cor desproporcional ao MVP; RGB 300 DPI atende à maioria das gráficas e destrava a entrega agora.

## Decision

O MVP entrega a arte em **RGB 300 DPI**, nos formatos **PNG e PDF**. **CMYK real com perfil ICC fica adiado**.

## Consequences

### Positive
- Pipeline inteiro cabe na Edge Function; sem worker externo no MVP.
- Entrega rápida e compatível com a maioria das gráficas.

### Negative
- Cor final não é colorimetricamente controlada; depende da conversão da gráfica.

### Neutral
- **Gatilho para reabrir esta decisão**: se a **gráfica escolhida pelo dono exigir CMYK** (ou houver desvio de cor inaceitável na prova impressa), retomar CMYK/ICC — o que provavelmente aciona o worker externo previsto como plano de escala (ADR-001 / ADR-005).
