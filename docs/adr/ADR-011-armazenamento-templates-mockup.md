# ADR-011: Armazenamento de templates de mockup (bucket privado + tabela)

## Status

accepted

## Context

O mockup contextual (ADR-008 a ADR-010) pode operar sobre **cenas pré-cadastradas** ("templates"): uma foto de cenário reutilizável, acompanhada da **geometria da área-alvo** já definida, de modo que o alvo circular chegue **pré-preenchido** (ADR-008). É preciso decidir **onde e como** persistir esses templates.

A decisão é necessária agora porque define o modelo de dados e o storage da feature, e porque envolve uma nuance de formato de imagem que **pode ser confundida com o ADR-002**. O projeto já tem buckets e policies estabelecidos; o ambiente é **single-tenant**. As forças: **coerência semântica** (não misturar templates com uploads de arte), **evitar herdar constraints indevidas**, **espelhar** as convenções de RLS/GRANT já existentes e **não inchar** o banco com binários.

**Ponto crítico sobre WebP**: para a cena de template, **WebP é PERMITIDO**. Isto **não contradiz o ADR-002**. O ADR-002 proíbe WebP na **imagem de ORIGEM da arte de impressão** — que é decodificada pelo **ImageScript no Deno** (que não lê WebP) e vai à gráfica. A **cena de template** é apenas **backdrop** composto no **Canvas do browser** (ADR-010): **nunca vai ao Deno nem à gráfica**. São imagens de propósitos distintos.

## Alternatives considered

### Alt 1 (escolhida): Bucket privado `mockup_templates` + tabela `mockup_templates`

**Pros**:
- **Separação semântica limpa**: cena e metadados de template ficam isolados de `uploads` (arte).
- **Geometria-alvo normalizada** persistida como **JSON** (posição/raio/rotação em coordenadas normalizadas 0–1), independente da resolução da cena — pré-preenche o alvo do ADR-008.
- **RLS single-tenant** espelhando os buckets existentes: `using(true)` / `with check(true)` + **GRANTs** correspondentes, sem inventar padrão novo.
- Bucket **próprio** evita herdar a constraint **PNG/JPEG** de `uploads` — aqui **WebP é permitido** para a cena (ver Context; não conflita com ADR-002).

**Cons**:
- Cria um bucket e uma tabela novos para manter.
- Exige escrever as policies/GRANTs (ainda que por espelhamento do padrão existente).

**Rejection reason** *(não se aplica — alternativa escolhida)*.

### Alt 2: Reusar o bucket `uploads` existente

**Pros**:
- Nenhum bucket novo; reuso imediato de policies já ativas.

**Cons**:
- **Mistura semântica**: cenas de template convivem com artes de origem, dificultando lifecycle/limpeza.
- **Herda a constraint PNG/JPEG** de `uploads` — que existe para a arte de impressão (ADR-002) e é **indevida** para a cena, justamente onde WebP deveria ser permitido.

**Rejection reason**: Acopla dois domínios distintos e importa uma restrição de formato que não faz sentido para a cena, complicando a feature.

### Alt 3: Guardar a cena como base64/data-URL na própria tabela

**Pros**:
- Sem storage/bucket: tudo em uma linha do banco.
- Uma leitura só traz metadados + imagem.

**Cons**:
- **Estoura o tamanho de linha/DB**: imagens em base64 incham a tabela, degradam backups e queries.
- Perde CDN/streaming de storage e cache de objeto.

**Rejection reason**: Persistir binário de imagem em coluna é anti-padrão de custo/performance; o storage dedicado resolve melhor.

## Decision

Templates de mockup são armazenados em um **bucket privado `mockup_templates`** (a cena) mais uma **tabela `mockup_templates`** com a **geometria-alvo normalizada em JSON**. RLS **single-tenant** (`using(true)` / `with check(true)`) + **GRANTs**, **espelhando** os buckets/policies existentes. **WebP é permitido para a cena** (não conflita com o ADR-002, que rege apenas a imagem de origem da arte de impressão).

## Consequences

### Positive
- Domínio de templates isolado, com lifecycle próprio e sem constraint de formato indevida.
- Geometria normalizada em JSON pré-preenche o alvo (ADR-008) e independe da resolução da cena.
- RLS/GRANT consistentes com o restante do projeto.

### Negative
- Um bucket e uma tabela a mais para provisionar e manter.

### Neutral
- **Registro anti-regressão**: a permissão de WebP na cena é **deliberada**; não "padronizar" com a constraint do ADR-002, que trata de outra imagem (origem da arte, decodificada no Deno).
- RLS `using(true)/with check(true)` reflete o **single-tenant** atual; revisitar se o projeto evoluir para multi-tenant.
