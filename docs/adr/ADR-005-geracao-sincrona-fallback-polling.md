# ADR-005: Geração síncrona na Edge com fallback assíncrono por polling

## Status

accepted

## Context

A arte final é gerada na Edge Function (ADR-001). Edge Functions têm **orçamento de tempo/memória limitado**, então precisamos decidir o modelo de resposta: síncrono (o client espera e recebe a arte na mesma requisição) ou assíncrono (o client dispara o job e busca o resultado depois).

A decisão é necessária agora porque define o contrato da API de geração e o modelo de UX. O contexto favorece o caminho síncrono no MVP: os **tamanhos-alvo são pequenos** (32/44/58mm → ~378/520/685px a 300 DPI), o que resulta em render **sub-segundo** no caso feliz. Ainda assim, é preciso um limite de segurança para não estourar o orçamento da Edge em casos maiores/mais pesados, sem obrigar toda geração a pagar o custo de complexidade do assíncrono.

## Alternatives considered

### Alt 1: Sempre assíncrono desde o início (enfileira, client faz polling sempre)
**Pros**:
- Modelo uniforme, robusto a qualquer tamanho ou pico de carga.
- Caminho natural para um worker por fila no futuro.

**Cons**:
- Adiciona latência e complexidade (tabela de jobs + polling) mesmo no caso feliz sub-segundo.
- UX pior para o fluxo dominante (tamanhos pequenos) sem ganho real.
- Over-engineering para volume interno single-tenant no MVP.

**Rejection reason**: Impõe custo de complexidade e latência a 100% dos casos para cobrir uma minoria; desproporcional dado que o caso comum renderiza em sub-segundo.

### Alt 2 (escolhida): Síncrono no caso feliz, com fallback assíncrono por polling
**Pros**:
- Caso comum (tamanhos pequenos) responde na hora — melhor UX, menos moving parts.
- Casos que excedem o **orçamento de tempo** degradam graciosamente: retorna **202** e o client faz **polling** em `generation_jobs`.
- Mantém um caminho claro de evolução para escala (worker por fila) sem reescrever o caso feliz.

**Cons**:
- Dois caminhos de código (síncrono + assíncrono) para manter e testar.
- Client precisa lidar com duas formas de resposta (resultado direto vs. 202 + polling).

**Rejection reason** *(não se aplica — alternativa escolhida)*.

## Decision

A Edge Function responde **síncrono no caso feliz** (tamanhos pequenos, <800px a 300 DPI, render sub-segundo). Se a geração **exceder o orçamento de tempo**, retorna **202** e o client faz **polling** na tabela **`generation_jobs`**. O **plano B de escala** é um **worker externo por fila**.

## Consequences

### Positive
- Melhor UX no fluxo dominante; complexidade assíncrona só quando necessária.
- Degradação graciosa em casos pesados, sem falhar a requisição.

### Negative
- Dois caminhos de resposta aumentam a superfície de teste (client e server).

### Neutral
- Requer a tabela **`generation_jobs`** para rastrear jobs assíncronos e o polling do client.
- O **worker externo por fila** é o próximo passo de escala e conecta-se ao caminho reservado no ADR-001 e ao possível trabalho de CMYK do ADR-004.
