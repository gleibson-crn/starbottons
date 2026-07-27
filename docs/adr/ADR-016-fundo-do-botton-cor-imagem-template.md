# ADR-016: Fundo do botton (cor sólida, imagem e template)

## Status

accepted

## Context

O botton é composto por uma **imagem enviada pelo usuário** recortada ao círculo da arte. Quando essa imagem tem **transparência** (PNG com alpha) ou não cobre todo o disco, é preciso definir **o que aparece por baixo**. Até aqui o fundo existia apenas como **cor** — o campo `EditorTransform.background` (default **branco `#ffffff`**) — e viajava para a Edge Function `generate-art` como uma **string** em `options.background`. Isso não cobria os cenários de **imagem de fundo** por upload nem de **template de fundo** pré-cadastrado, que a curadoria já sabe operar por analogia à área de mockups.

A decisão é necessária **agora** por dois motivos convergentes. Primeiro, há uma **demanda de produto**: o usuário precisa escolher o fundo do botton (cor, imagem ou template), inclusive com **conta-gotas** (EyeDropper) para casar a cor com a arte. Segundo, há um **bug visual a corrigir**: o `<rect>` de fundo estava sendo **recortado ao círculo** junto com a arte, deixando os **cantos do PNG quadrado transparentes**; visualizadores que renderizam alpha (Finder/preview, alguns navegadores) exibiam o **padrão xadrez** nos cantos. O PNG-origem precisa sair **100% opaco**.

As forças em jogo: o **enquadramento** (offset/scale/rotation) é aplicado pela Edge **somente à imagem do usuário**; **preservar a resolução** de 300 DPI; **não regredir** o contrato nem os golden tests de geometria da Edge; e **evitar** reintroduzir a classe de divergência entre o que o cliente compõe e o que a Edge compõe — problema já enfrentado no enquadramento e mitigado em **ADR-014** (filtros: o cliente trata a fonte, a Edge não muda). Aqui a situação é o **espelho** de ADR-014: o fundo **não pode** ser baked na fonte, justamente porque a Edge transforma a fonte.

A restrição central que determina a arquitetura: **se o fundo fosse baked no PNG-origem junto com a imagem do usuário**, o transform da Edge (offset/scale/rotation) **moveria o fundo junto com a arte** — comportamento errado. O fundo é uma **camada fixa** sob uma arte que se move; portanto precisa ser um **parâmetro separado**, não parte da fonte transformada.

## Alternatives considered

### Alt 1: Compor tudo no cliente e enviar PNG-origem opaco (analogia à Abordagem A do ADR-014)

O cliente pintaria a camada de fundo (cor/imagem) **sob** a imagem do usuário no canvas, achataria em um **PNG-origem opaco** e subiria essa composição; a Edge apenas recomporia geometria, como em ADR-014.

**Pros**:
- **Reuso** do padrão de ADR-014 (cliente trata a fonte, Edge inalterada).
- Fundo já **embutido** — não haveria novo campo no contrato de `generate-art`.

**Cons**:
- **Conflita frontalmente com o transform da Edge**: a Edge aplica offset/scale/rotation **sobre toda a fonte**; se o fundo estiver baked na fonte, mover/ampliar/rotacionar a arte **moveria o fundo junto** — o fundo deixaria de ser uma camada fixa do botton.
- Obrigaria o cliente a **reproduzir o transform da Edge** para separar arte de fundo, reintroduzindo o risco de **divergência cliente↔Edge**.

**Rejection reason**: Incompatível com o modelo de enquadramento — o transform da Edge é aplicado **apenas** à imagem do usuário, e um fundo baked na fonte seria transformado junto. A analogia com ADR-014 **não vale** aqui porque em ADR-014 a fonte tratada **é** exatamente o que sofre o transform; o fundo, ao contrário, é uma camada que deve permanecer **estática**.

### Alt 2: Manter fundo só como cor via `options.background` string (status quo)

Preservar o campo atual (`options.background` como string de cor, default `#ffffff`) sem evoluí-lo.

**Pros**:
- **Zero mudança** de contrato; comportamento já existente e validado.

**Cons**:
- **Não cobre** imagem de fundo por upload nem template pré-cadastrado — não atende à demanda de produto.
- **Não resolve** o bug do xadrez, pois o problema não é o tipo do fundo e sim o `<rect>` estar sendo **recortado ao círculo** (cantos transparentes).

**Rejection reason**: Insuficiente para o escopo (cor + imagem + template) e ortogonal ao bug dos cantos transparentes, que persistiria independentemente do tipo de fundo.

### Alt 3 (escolhida): Modelo 1 — a Edge compõe o fundo como camada separada

O fundo é uma **propriedade do botton**, renderizada pela Edge como **camada sob** a imagem do usuário. A Edge `generate-art` continua sendo a **compositora** em alta resolução (300 DPI): pinta primeiro o **quadrado de fundo** (cor OU imagem), **cobrindo o QUADRADO INTEIRO e opaco**, e por cima aplica a **imagem do usuário transformada** (offset/scale/rotation), recortada ao **círculo** da arte. O fundo viaja como **parâmetro separado** em `options.background`, agora **objeto**, nunca baked na fonte.

**Pros**:
- **Fundo é camada fixa**: o transform da Edge atua **só** na imagem do usuário; mover/ampliar a arte **não move** o fundo.
- **Corrige o xadrez por construção**: o fundo preenche o **quadrado inteiro**, entregando um **PNG 100% opaco** (sem cantos transparentes).
- **Um único ponto de composição** (a Edge), evitando divergência cliente↔Edge e preservando a resolução de 300 DPI.
- **Suporta os três modos** (cor, imagem, template) sob o mesmo contrato, com **fallback** seguro para branco.

**Cons**:
- **Evolui o contrato** de `generate-art`: `options.background` passa de **string** para **objeto** (exige compatibilidade/fallback).
- Introduz **composição de imagem de fundo na Edge** (Estágio 2) — nova responsabilidade no ImageScript/WASM (buscar o path do bucket, cobrir o quadrado, respeitar opacidade).
- Requer **nova tabela + storage** para templates de fundo (Estágio 2).

**Rejection reason** *(não se aplica — alternativa escolhida)*.

## Decision

O **fundo é uma propriedade do BOTTON**, uma **camada renderizada sob** a imagem enviada pelo usuário — **NÃO** é aplicado à imagem. Uma imagem com transparência mostra o **fundo escolhido do botton** (default **branco `#ffffff`**). O usuário escolhe entre: **(a) cor sólida** (com conta-gotas/EyeDropper), **(b) imagem de fundo** por upload ou **(c) template de fundo** pré-cadastrado.

A composição segue o **Modelo 1**: a Edge Function `generate-art` continua compondo as camadas em **alta resolução (300 DPI)** — **quadrado de fundo** (cor OU imagem, **cobrindo o quadrado inteiro e opaco**) e, por cima, a **imagem do usuário transformada** (offset/scale/rotation) recortada ao **círculo** da arte. O fundo **NÃO** é baked na fonte; viaja como **parâmetro separado** em `options.background`, que **evolui de string para objeto**:

- `{ kind: 'color', color: '#rrggbb' }` — **Estágio 1**
- `{ kind: 'image', path: '<caminho no bucket uploads>' }` — **Estágio 2** (imagem e template resolvem para um path de storage)

**Fallback**: ausência ou valor inválido de `options.background` ⇒ **branco `#ffffff`**.

**Faseamento**:
- **Estágio 1**: cor + conta-gotas (EyeDropper) + **correção do xadrez**. A cor de fundo já existia em `EditorTransform.background` (default `#ffffff`); o fundo passa a preencher o quadrado inteiro (PNG opaco).
- **Estágio 2**: imagem (upload) + templates + composição de imagem de fundo na Edge. Templates ganham nova tabela `background_templates` + storage, **espelhando o padrão de `mockup_templates`** (single-tenant, **sem `client_id`**, RLS `for all to authenticated using (true) with check (true)` + GRANTs). A curadoria **reaproveita os padrões** da área `/app/mockups`.

## Consequences

### Positive

- **Fundo é camada fixa do botton**: o transform da Edge atua **apenas** na imagem do usuário — mover/ampliar/rotacionar a arte **não desloca** o fundo.
- **Bug do xadrez corrigido por construção**: o fundo preenche o **quadrado inteiro**, gerando um **PNG-origem 100% opaco**; visualizadores não exibem mais os cantos transparentes.
- **Um único ponto de composição** (a Edge), sem divergência cliente↔Edge e com **resolução de 300 DPI** preservada.
- Contrato único cobre **os três modos** (cor, imagem, template) com **fallback** seguro para branco.
- Templates de fundo **reaproveitam** o padrão consolidado de `mockup_templates` (tabela, storage, RLS single-tenant, curadoria em `/app`).

### Negative

- **Contrato evoluído**: `options.background` deixa de ser string e passa a ser objeto — exige tratar compatibilidade e o fallback para branco onde antes se assumia string.
- **Nova responsabilidade na Edge** (Estágio 2): compor **imagem de fundo** no ImageScript/WASM (resolver path do bucket, cobrir o quadrado, garantir opacidade), com necessidade de **golden tests** de composição de fundo.
- **Nova superfície de dados** (Estágio 2): tabela `background_templates` + storage + RLS/GRANTs a manter.

### Neutral

- **Faseamento explícito**: Estágio 1 (cor + conta-gotas + correção do xadrez) entrega valor e corrige o bug sem depender do Estágio 2 (imagem + templates + composição na Edge).
- **Relação com ADR-014**: este ADR é o **espelho** daquele — em ADR-014 o cliente trata a **fonte** (que sofre o transform) e a Edge não muda; aqui o fundo **não** pode ser baked na fonte **justamente porque** a Edge a transforma, então o fundo é parâmetro separado composto pela Edge.
- **Default preservado**: `#ffffff` continua sendo o comportamento na ausência de escolha explícita.
