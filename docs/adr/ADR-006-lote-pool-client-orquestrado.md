# ADR-006: Estratégia de processamento em lote via pool client-orquestrado

## Status

accepted

## Context

O MVP gera **uma arte por vez** através da Edge Function `generate-art` (ADR-005): síncrona no caso feliz, com fallback **202 + polling** em `generation_jobs`, **idempotente** por `job_id` (uuid v4 gerado no client) e persistência por **UPSERT**.

A nova feature de **lote** precisa gerar cerca de **25 imagens × 1–3 tamanhos** (até **~75 artes**) em um único fluxo disparado pelo usuário. A decisão é necessária agora porque define como esse volume atravessa o backend sem quebrar o contrato existente. As forças em jogo: **reuso máximo** do que já funciona, **mínima mudança de backend**, cenário **single-tenant** de volume interno, e o fato de a Edge (WASM) ter **CPU e tempo de invocação limitados** — o que inviabiliza processar 75 artes numa única chamada. Precisamos de paralelismo controlado, granularidade de erro/retry por arte e uma barra de progresso confiável, sem introduzir infraestrutura nova desproporcional ao volume.

## Alternatives considered

### Alt 1 (escolhida): Pool client-orquestrado sobre a `generate-art` existente

**Pros**:
- **Reuso total** da Edge `generate-art`: cada arte é uma invocação idempotente já testada (ADR-005), **sem mudança de backend**.
- **Granularidade fina** de erro e retry: cada arte falha/reprocessa isoladamente; a idempotência por `job_id` torna retries seguros.
- Concorrência **limitada e controlada** (pool fixo de 4) respeita o orçamento de CPU/tempo por invocação da Edge e evita disparar 75 chamadas de uma vez.
- Progresso agregado no client é natural; **cancelamento** via `AbortController`; resiliência a **429/5xx** com **backoff + jitter**.

**Cons**:
- A orquestração **depende da aba aberta**: fechar o navegador interrompe o disparo dos jobs restantes.
- Lógica de concorrência/backoff/cancelamento vive no client e precisa ser testada lá.

**Rejection reason** *(não se aplica — alternativa escolhida)*.

### Alt 2: Endpoint de lote único na Edge (uma invocação processa o lote inteiro)

**Pros**:
- Um único ponto de entrada; o client faz uma chamada só.
- Orquestração centralizada no servidor, independente da aba.

**Cons**:
- **Reescreve** a Edge `generate-art` (ou cria uma paralela), descartando o reuso do caminho já validado.
- Processar ~75 artes numa invocação **estoura o orçamento de CPU/tempo** da Edge WASM.
- **Pior granularidade** de erro/retry: falha no meio do lote é difícil de reprocessar parcialmente.

**Rejection reason**: Viola a restrição de mínima mudança de backend e colide com o limite de CPU/tempo por invocação; degrada retry/observabilidade por arte.

### Alt 3: Fila assíncrona no backend (pgmq / pg_cron / Realtime)

**Pros**:
- Independente da aba; suporta rodar com o navegador fechado.
- Escala naturalmente para volumes muito maiores.

**Cons**:
- **Nova infraestrutura** (fila, worker, tópicos Realtime) desproporcional a ~75 jobs internos.
- Mais moving parts para operar e monitorar num cenário single-tenant de MVP.

**Rejection reason**: Over-engineering para o volume atual; a complexidade operacional não se justifica antes de haver requisito de volume/execução em background.

## Decision

Adotar um **pool client-orquestrado**: o client dispara **N chamadas concorrentes** (pool **fixo em 4**) e **idempotentes** à Edge `generate-art` **existente**, com **backoff + jitter** em **429/5xx**, **cancelamento** via `AbortController`, e **agregação de progresso** no próprio client. A **Edge não muda**.

## Consequences

### Positive
- Zero mudança de backend na geração; reuso integral do contrato do ADR-005.
- Retry e erro por arte são isolados e seguros graças à idempotência por `job_id`.
- Concorrência limitada protege o orçamento da Edge e mantém UX responsiva (progresso + cancelamento).

### Negative
- A execução do lote **depende da aba aberta**; fechar/navegar interrompe os jobs ainda não disparados.

### Neutral
- Documentar o **gatilho de migração para fila assíncrona** (Alt 3), a ser reavaliado quando: volume **> ~150 jobs/lote**, necessidade de **rodar com a aba fechada**, ou evolução para **multi-tenant**.
- Conecta-se ao caminho de escala reservado no **ADR-005** (worker externo por fila).
