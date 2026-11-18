# ADR-022: Moldura do botton (camada decorativa sobre a arte)

## Status

superseded por ADR-023

> O COVER-fixo e a moldura única deste ADR foram substituídos pelo **sistema de camadas com gestos** (até 3 molduras empilhadas, enquadramento próprio e z-order) do ADR-023. O restante (topo da pilha, PNG-only, nunca baked na fonte, curadoria em `/app/frames`) permanece válido.

## Context

O botton é composto em **camadas** pela Edge Function `generate-art`: hoje a ordem é **cor base → fundo → arte**, onde o **fundo** (ADR-016) é uma camada fixa **sob** a imagem do usuário e a **arte** é a imagem enviada, transformada (offset/scale/rotation) e recortada ao **círculo**. Falta o outro extremo da pilha: uma **moldura** — camada decorativa que fica **na frente** da arte (por cima), dando acabamento à borda do disco (aro, festão, ornamento, área central vazada). A moldura é o **espelho superior** do que o fundo é na base: assim como o fundo cobre o que está atrás da arte, a moldura decora o que está à frente dela.

A decisão é necessária **agora** por uma **demanda de produto**: o usuário precisa aplicar molduras ao botton, com **curadoria própria** (templates cadastráveis), fechando a simetria da composição — a mesma capacidade que o fundo já entrega na base passa a existir no topo. Sem isso, não há como sobrepor um ornamento à arte sem que o usuário tenha de embutir a moldura manualmente na própria imagem, o que colide com o enquadramento (ver abaixo).

As forças em jogo são as **mesmas** do ADR-016. O **enquadramento** (offset/scale/rotation) é aplicado pela Edge **somente à imagem do usuário**; é preciso **preservar a resolução** de 300 DPI; **não regredir** o contrato nem os golden tests de geometria; e **evitar** reintroduzir a divergência entre o que o cliente compõe e o que a Edge compõe (classe de problema tratada em ADR-014 e ADR-016). O recorte ao **círculo** já é responsabilidade do `svg.ts`, e a composição de camadas de imagem na Edge já é fato consolidado (`composeArtwork`/`composeLayer`) desde o Estágio 2 do fundo.

A restrição central que determina a arquitetura é o **espelho** da do ADR-016: **se a moldura fosse baked na fonte** (embutida no PNG-origem junto com a imagem do usuário), o transform da Edge (offset/scale/rotation) **moveria a moldura junto com a arte** — comportamento errado. A moldura é uma **camada fixa** sobre uma arte que se move; logo precisa ser um **parâmetro separado**, composto pela Edge **por último**, não parte da fonte transformada.

## Alternatives considered

### Alt 1: Moldura "baked" no cliente sobre a fonte (analogia à Abordagem A do ADR-014/ADR-016)

O cliente pintaria a moldura **sobre** a imagem do usuário no canvas, achataria tudo em um **PNG-origem** e subiria essa composição; a Edge apenas recomporia a geometria.

**Pros**:
- **Reuso** aparente do padrão "cliente trata a fonte, Edge inalterada".
- Moldura já **embutida** — nenhum novo campo no contrato de `generate-art`.

**Cons**:
- **Conflita frontalmente com o transform da Edge**: a Edge aplica offset/scale/rotation **sobre toda a fonte**; se a moldura estiver baked na fonte, mover/ampliar/rotacionar a arte **moveria a moldura junto** — a moldura deixaria de ser uma camada fixa do botton.
- Obrigaria o cliente a **reproduzir o transform da Edge** para separar arte de moldura, reintroduzindo o risco de **divergência cliente↔Edge**.

**Rejection reason**: Incompatível com o modelo de enquadramento, pela **mesma razão do ADR-016** — o transform da Edge atua **apenas** na imagem do usuário, e uma moldura baked na fonte seria transformada junto. A analogia com ADR-014 **não vale** aqui porque a moldura é uma camada que deve permanecer **estática** em relação à arte que se move.

### Alt 2 (escolhida): A Edge compõe a moldura como camada separada, no topo da pilha

A moldura é uma **propriedade do botton**, renderizada pela Edge como **camada sobre** a imagem do usuário — o **espelho superior** do fundo (ADR-016). A Edge `generate-art` continua sendo a **compositora** em alta resolução (300 DPI): reusa `composeArtwork` e adiciona a moldura como **último `composeLayer` antes do encode**. A ordem final passa a ser **cor base → fundo → arte → moldura (topo)**. A moldura viaja como **parâmetro separado**, nunca baked na fonte. O recorte ao **círculo** já é feito pelo `svg.ts`. A moldura é **PNG-only** (canal alfa obrigatório: a área central transparente deixa a arte aparecer) e usa **COVER fixo** (preenche o círculo inteiro, **sem** enquadramento próprio).

**Pros**:
- **Moldura é camada fixa**: o transform da Edge atua **só** na imagem do usuário; mover/ampliar/rotacionar a arte **não move** a moldura.
- **Um único ponto de composição** (a Edge), evitando divergência cliente↔Edge e preservando a resolução de 300 DPI.
- **Reuso máximo** do que ADR-016 já construiu: `composeArtwork`/`composeLayer`, recorte no `svg.ts`, bucket `uploads`, e o padrão de tabela/curadoria de templates.
- **Simetria de modelo** com o fundo — mesma disciplina arquitetural nas duas pontas da pilha.

**Cons**:
- **Evolui o contrato** de `generate-art`: novo parâmetro para a moldura (path no bucket + fallback "sem moldura").
- Adiciona **mais um `composeLayer`** por render (custo de CPU no worker da Edge), mitigado pelo downscale ≤1000px no upload.
- Requer **nova tabela + nova rota** de curadoria (`frame_templates` + `/app/frames`).

**Rejection reason** *(não se aplica — alternativa escolhida)*.

### Alt 3: Aceitar múltiplos formatos (JPEG/WebP) para a moldura

Permitir que a moldura fosse enviada em JPEG ou WebP além de PNG, como faz o upload de imagens em outros pontos.

**Pros**:
- Maior **flexibilidade** de formatos de origem para quem cadastra molduras.

**Cons**:
- **JPEG não tem canal alfa** — sem transparência, a moldura cobriria a arte inteira, quebrando o propósito da camada (área central vazada).
- **WebP** violaria a **política do ADR-002** (não usar WebP na origem de impressão).

**Rejection reason**: A moldura **depende** de canal alfa para deixar a arte aparecer; JPEG não atende e WebP é vedado por ADR-002. Restringir a **PNG-only** é requisito funcional, não preferência.

## Decision

A **moldura é uma propriedade do BOTTON**, uma **camada decorativa renderizada sobre** a imagem enviada pelo usuário (topo da pilha) — **NÃO** é aplicada à imagem nem baked na fonte. É o **espelho superior do fundo** (ADR-016): assim como o fundo é a camada fixa **atrás** da arte, a moldura é a camada fixa **à frente** da arte. A ordem final de composição do botton passa a ser: **cor base → fundo → arte → moldura (topo)**.

A composição segue o **mesmo modelo do ADR-016**: a Edge Function `generate-art` compõe as camadas em **alta resolução (300 DPI)**, **reusando `composeArtwork`** e adicionando a moldura como **último `composeLayer` antes do encode**. O recorte ao **círculo** continua a cargo do `svg.ts`. A moldura **NÃO** é baked na fonte; viaja como **parâmetro separado** (path no bucket `uploads`), com **fallback** para "sem moldura" na ausência ou valor inválido.

Regras da moldura:

- **PNG-only**: canal alfa obrigatório (a área central transparente deixa a arte aparecer). **JPEG e WebP são rejeitados** (falta de alfa e política ADR-002 de não usar WebP na origem de impressão).
- **COVER fixo (sem gestos)**: a moldura **sempre preenche o círculo inteiro**; **não** possui enquadramento próprio (sem offset/zoom/rotação). Decisão de **MVP** — o design deixa a porta aberta para gestos no futuro, mas **não** implementa agora.
- **Downscale ≤1000px** no upload (preservando alfa), pelo limite de CPU do worker da Edge — **mesma política do fundo** (ADR-016).

**Curadoria própria**: nova rota **`/app/frames`** + nova tabela **`frame_templates`** (espelho de `background_templates`: single-tenant, **sem `client_id`**, RLS `for all to authenticated using (true) with check (true)` + GRANTs), **reusando o bucket `uploads`** do Storage. A curadoria **reaproveita os padrões** já consolidados nas áreas `/app/backgrounds` e `/app/mockups`.

## Consequences

### Positive

- **Moldura é camada fixa do botton**: o transform da Edge atua **apenas** na imagem do usuário — mover/ampliar/rotacionar a arte **não desloca** a moldura.
- **Um único ponto de composição** (a Edge), sem divergência cliente↔Edge e com **resolução de 300 DPI** preservada.
- **Reuso máximo** da infra do ADR-016: `composeArtwork`/`composeLayer`, recorte no `svg.ts`, bucket `uploads` e o padrão de tabela/curadoria — baixo custo de implementação e simetria com o fundo.
- **PNG-only garante o vazado central por construção**: a transparência da moldura deixa a arte aparecer, sem hacks de máscara adicionais.

### Negative

- **Contrato evoluído**: `generate-art` ganha novo parâmetro para a moldura (path no bucket) — exige tratar o **fallback** "sem moldura" onde a moldura for ausente/ inválida.
- **Custo de CPU** por render: mais um `composeLayer` no worker da Edge, mitigado pelo **downscale ≤1000px** no upload.
- **Nova superfície de dados e UI**: tabela `frame_templates` + rota `/app/frames` a manter, além de **golden tests** de composição da camada de moldura.

### Neutral

- **Relação com ADR-016**: este ADR é o **espelho superior** daquele — mesmo modelo (camada separada composta pela Edge, nunca baked na fonte), aplicado ao **topo** da pilha em vez da base. A disciplina arquitetural é idêntica.
- **Relação com ADR-002**: a rejeição de WebP na moldura reafirma a política de origem de impressão; PNG-only atende também ao requisito de alfa.
- **COVER fixo é decisão de MVP**: o design mantém a **porta aberta** para gestos (offset/zoom/rotação da moldura) no futuro, sem implementá-los agora — evolução aditiva, não bloqueada por este ADR. *(Essa porta foi usada pelo ADR-023, que substitui este ADR pelo sistema de camadas com gestos.)*
- **Single-tenant preservado**: `frame_templates` segue o mesmo desenho sem `client_id` de `background_templates`/`mockup_templates`; projeto permanece **local-only** (sem GitHub/deploy).
