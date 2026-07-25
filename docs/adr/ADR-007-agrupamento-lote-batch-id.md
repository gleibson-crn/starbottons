# ADR-007: Agrupamento dos jobs do lote via coluna `batch_id`

## Status

accepted

## Context

Com o processamento em lote (ADR-006), os jobs individuais gerados por um mesmo disparo precisam ser **agrupados** para dois fins: exibir **progresso agregado** e montar o **ZIP** com as artes do lote. Hoje cada job vive isolado em `generation_jobs`, sem noção de pertencimento a um conjunto.

A decisão é necessária agora porque o modelo de agrupamento define o schema e o contrato de persistência do lote. As forças: cenário **single-tenant**, **sem metadados de lote** além do próprio agrupamento (não há requisito de nome, autoria ou auditoria de lote no v1), e a restrição de **não alterar a Edge** `generate-art`, que persiste via **UPSERT por `id`**. Qualquer solução precisa preservar a retrocompatibilidade com o fluxo single (uma arte por vez) e não zerar colunas que a Edge não conhece no payload.

## Alternatives considered

### Alt 1 (escolhida): Coluna `batch_id uuid` NULLABLE em `generation_jobs`

**Pros**:
- **Migration de uma linha** (coluna + índice parcial); `batch_id null` representa o **fluxo single**, mantendo **retrocompatibilidade** total.
- **RLS, grants e políticas existentes** de `generation_jobs` já cobrem a nova coluna — nada novo a provisionar.
- O client faz **PRE-INSERT** do job (`status = queued` + `batch_id`) antes de invocar a Edge; o **UPSERT por `id`** da Edge **preserva `batch_id`** (não sobrescreve colunas ausentes no payload) → **Edge intacta**.
- Consultas de progresso/ZIP são um simples `WHERE batch_id = ?`.

**Cons**:
- **Sem lugar no servidor** para metadados de lote (nome, criado_por, timestamps de lote) — vivem só no client no v1.

**Rejection reason** *(não se aplica — alternativa escolhida)*.

### Alt 2: Tabela `batches` dedicada com FK a partir de `generation_jobs`

**Pros**:
- Lugar natural para **metadados de lote** (nome, autor, contadores, status agregado).
- Modelo relacional explícito entre lote e jobs.

**Cons**:
- **Nova tabela** implica novas **RLS, grants e FK** — superfície de segurança/manutenção adicional.
- Nenhum requisito atual (single-tenant, sem metadados) **justifica** esse custo agora.

**Rejection reason**: Introduz tabela/políticas/FK sem requisito que as motive no v1; `batch_id` cobre o MVP e pode evoluir para uma tabela `batches` depois **sem quebrar dados** (o uuid vira a FK).

## Decision

Adicionar `batch_id uuid` **NULLABLE** a `generation_jobs`, com **índice parcial** (`WHERE batch_id IS NOT NULL`). `batch_id null` = **fluxo single** (retrocompatível). O client faz **PRE-INSERT** do job (`status = queued` + `batch_id`) antes de invocar a Edge; o **UPSERT por `id`** da Edge **preserva** `batch_id`, mantendo a Edge inalterada.

## Consequences

### Positive
- Mudança de schema mínima e retrocompatível; reuso de RLS/grants existentes.
- Progresso e ZIP resolvidos com uma consulta trivial por `batch_id`.
- Edge `generate-art` permanece intacta (alinhado ao ADR-006).

### Negative
- **Sem armazenamento server-side de metadados de lote** (nome, criado_por) — o client detém esse estado no v1; recarregar a página perde o contexto de lote não persistido.

### Neutral
- Caminho de evolução aberto: se metadados/multi-tenant surgirem, promover `batch_id` para FK de uma tabela `batches` sem migração destrutiva.
- Depende do **PRE-INSERT** pelo client como parte do fluxo do ADR-006.
