# ADR-023: Molduras em camadas com gestos (empilhamento, enquadramento próprio e z-order)

## Status

accepted (supersedes ADR-022)

## Context

O ADR-022 estabeleceu a **moldura** como camada decorativa composta pela Edge **sobre** a arte (topo da pilha `cor base → fundo → arte → moldura`), com duas restrições de MVP: **uma única moldura** por botton e **COVER fixo** (a moldura sempre preenche o círculo inteiro, **sem** enquadramento próprio — sem offset/zoom/rotação). O próprio ADR-022 já registrou, como consequência neutra, que o design mantinha a **porta aberta para gestos** e para evolução aditiva. Esta decisão passa por essa porta.

A decisão é necessária **agora** por **demanda de produto**: o usuário precisa **compor acabamentos** — por exemplo um aro externo + um festão + um ornamento central — e precisa **posicionar cada peça** sobre o disco (arrastar, dar zoom e girar), exatamente como já faz com a imagem de fundo (ADR-016). O COVER-fixo de uma peça só não cobre esse caso: não dá para empilhar ornamentos nem reposicionar nenhum deles. O fundo já provou o padrão de **gestos na prévia** (framing por camada); falta levar a mesma capacidade ao topo da pilha.

As forças em jogo são as **mesmas** das decisões de composição anteriores. O **enquadramento** (offset/scale/rotation) é aplicado por camada, nunca baked na fonte transformada; é preciso **preservar a resolução** de 300 DPI; manter **um único ponto de composição** (a Edge) para não reintroduzir a divergência cliente↔Edge (classe de problema de ADR-014/016/022); e respeitar os limites de **CPU do worker** da Edge (PNG-only, magic bytes, `FRAME_MAX_DIM`, downscale). Soma-se a isso o **fix de paridade recente**: a moldura cobre o **círculo VISÍVEL (corte)** e não a sangria — no cliente via `cutR*2` e na Edge via `visiblePx` — e esse comportamento precisa valer **para cada** moldura empilhada, já com o transform aplicado.

A restrição central que determina a arquitetura é a herdada do ADR-022 e do ADR-016: cada moldura é uma **camada fixa** em relação à arte que se move, logo cada uma viaja como **parâmetro separado** com seu **próprio** transform, composta pela Edge **por último**. A novidade é que agora são **N** camadas (até 3), **ordenadas**, cada uma com seu enquadramento.

## Alternatives considered

### Alt A: Uma moldura com gestos (evolução mínima do ADR-022)

Manter **uma** moldura por botton, mas trocar o COVER-fixo por **enquadramento próprio** (offset/scale/rotação) na prévia — sem permitir empilhamento.

**Pros**:
- Evolução **mínima** sobre o ADR-022: um único `FrameImageRef` ganha um `Framing`, um único transform no contrato da Edge.
- **Custo de CPU inalterado** (segue sendo um `composeLayer` de moldura por render).

**Cons**:
- **Não atende ao empilhamento**: é impossível combinar aro + festão + ornamento central, que é o cerne da demanda.
- Sem empilhamento **não há z-order** — o produto fica restrito a uma única peça por botton.

**Rejection reason**: Entrega o reposicionamento mas **não o empilhamento** de múltiplas molduras — deixa de fora o requisito principal do pedido (compor várias peças).

### Alt B (escolhida): N molduras empilhadas com gestos + z-order reordenável

A moldura deixa de ser peça única COVER-fixo e vira um **sistema de camadas**: **até 3** molduras PNG **empilhadas**, cada uma com **enquadramento próprio** (offset/scale/rotação, arrastar/zoom/girar na prévia, igual ao fundo do ADR-016). A **ordem do array** é a ordem de empilhamento (índice 0 = mais ao fundo das molduras; última = topo), **reordenável** (subir/descer na lista). Cada moldura cobre o **círculo visível (corte) + seu transform**, mantendo o fix de paridade (`cutR*2` no cliente, `visiblePx` na Edge). A **moldura ativa** para gestos é selecionada **pela lista** da aba Moldura. A Edge compõe as N molduras em **laço**, cada uma com seu `TransformOpts`, reusando `composeLayer` — ainda **PNG-only**, com **magic bytes** e **`FRAME_MAX_DIM`** preservados.

**Pros**:
- **Atende integralmente** à demanda: empilhar peças **e** posicionar cada uma.
- **Simetria total com o fundo** (ADR-016): mesmo modelo de framing por camada, mesma disciplina de gestos na prévia — reuso de padrão de UI e de transform.
- **z-order explícito** (ordem do array) dá controle de acabamento previsível e reordenável.
- **Um único ponto de composição** (a Edge) preservado; 300 DPI e paridade cliente↔Edge mantidos; guardas de segurança (PNG-only, magic bytes, `FRAME_MAX_DIM`) inalteradas.

**Cons**:
- **Custo de CPU na Edge** cresce: até **3** `composeLayer` de moldura por render, cada um com transform — mitigado pelo teto rígido de 3 e pelo downscale/`FRAME_MAX_DIM`.
- **Contrato e modelo evoluem**: `options.frames` vira **array** de `{path, offset{x,y}mm, scale, rotation}`; o cliente ganha `EditorTransform.frameImages: FrameImageRef[]`.
- **UI mais rica**: lista com seleção de moldura ativa, reordenação (subir/descer) e limite de 3.

**Rejection reason** *(não se aplica — alternativa escolhida)*.

### Alt C: Manter COVER-fixo e só permitir várias molduras (sem gestos)

Permitir empilhar até N molduras, mas todas em **COVER-fixo** (cada uma preenchendo o círculo inteiro, sem enquadramento próprio).

**Pros**:
- **Atende ao empilhamento** sem introduzir gestos por camada — contrato mais simples (array de `path`, sem transform por item).
- Menor mudança de UI (sem prévia interativa por moldura).

**Cons**:
- **Não atende ao reposicionamento**: sem offset/zoom/rotação, peças que não sejam aros concêntricos (ornamento canto, festão deslocado) ficam **impossíveis de encaixar**.
- **Quebra a simetria com o fundo** (ADR-016), que já oferece gestos — experiência inconsistente entre as pontas da pilha.

**Rejection reason**: Resolve o empilhamento mas **não o enquadramento** — deixa de fora metade do pedido (posicionar cada peça) e diverge do padrão de framing já consolidado no fundo.

## Decision

A moldura deixa de ser **"COVER fixo, 1 por botton"** (ADR-022) e passa a ser um **sistema de CAMADAS**: até **3 molduras PNG empilhadas**, cada uma com **enquadramento próprio** (offset/scale/rotação), reposicionáveis por **arrastar/zoom/girar na prévia** — exatamente como o **fundo** (ADR-016). Tudo o mais do ADR-022 é preservado: a moldura continua sendo propriedade do botton, composta pela Edge **no topo da pilha** (`cor base → fundo → arte → molduras`), **nunca** baked na fonte; **PNG-only** (alfa obrigatório), com **magic bytes** e **`FRAME_MAX_DIM`** mantidos; curadoria em `/app/frames` / `frame_templates` inalterada.

Regras do sistema de camadas:

- **Teto rígido de 3 molduras** por botton.
- **Z-order = ordem do array**: índice 0 é a mais ao fundo das molduras; a última é o topo. A ordem é **reordenável** pela UI (subir/descer na lista).
- **Cobertura**: cada moldura cobre o **círculo VISÍVEL (corte)** + seu transform — **não** a sangria. Mantém-se o fix de paridade recente: cliente `cutR*2`, Edge `visiblePx`, agora aplicado **por moldura** já com seu transform.
- **Seleção da moldura ativa** para gestos: **pela lista** da aba Moldura.

Modelo e contrato:

- **Cliente**: `EditorTransform.frameImages: FrameImageRef[]` — cada `FrameImageRef` carrega seu `Framing` (offset/scale/rotation).
- **Edge**: `options.frames: { path, offset{x,y} mm, scale, rotation }[]` — a Edge **compõe N molduras em laço**, cada uma com seu `TransformOpts`, reusando `composeLayer`, na ordem do array (índice 0 primeiro, topo por último).

**Retrocompatibilidade**: itens salvos com a **moldura única antiga** (modelo do ADR-022) **migram** para `frameImages: [ref]` — um array de um elemento, com framing default equivalente ao COVER-fixo anterior.

## Consequences

### Positive

- **Atende integralmente** à demanda: empilhar até 3 peças **e** posicionar cada uma (arrastar/zoom/girar), com **z-order reordenável**.
- **Simetria plena com o fundo** (ADR-016): mesmo modelo de framing por camada e mesma UX de gestos na prévia — reuso de padrão e menor carga cognitiva.
- **Um único ponto de composição** (a Edge) preservado, com **300 DPI** e **paridade cliente↔Edge** mantidos; o fix de cobertura do círculo visível (`cutR*2` / `visiblePx`) passa a valer por moldura.
- **Guardas de segurança inalteradas**: PNG-only, magic bytes e `FRAME_MAX_DIM` continuam valendo para cada moldura.
- **Retrocompat sem perda**: itens antigos continuam renderizando idênticos ao migrarem para `frameImages: [ref]`.

### Negative

- **Custo de CPU na Edge** aumenta: até **3** `composeLayer` de moldura por render, cada um com transform — o teto de 3 + downscale/`FRAME_MAX_DIM` são os mitigadores; é o maior trade-off desta decisão.
- **Contrato e modelo evoluem**: `options.frames` vira **array de objetos** (path + transform) e o cliente ganha `EditorTransform.frameImages: FrameImageRef[]` — exige migração do formato antigo.
- **UI mais rica a manter**: lista com seleção de moldura ativa, reordenação (subir/descer) e aplicação do limite de 3; golden tests de composição passam a cobrir o **laço** de N molduras com transform.

### Neutral

- **Relação com ADR-022**: este ADR **supera** o ADR-022, removendo as restrições de MVP (peça única + COVER-fixo) pela porta que o próprio ADR-022 deixou aberta; preserva todo o restante (topo da pilha, PNG-only, curadoria, nunca baked na fonte). O ADR-022 passa a `superseded por ADR-023`.
- **Relação com ADR-016**: a moldura torna-se o **espelho superior exato** do fundo — não só na posição (topo vs. base) como agora também no **modelo de framing por camada e gestos**. A base (1 fundo) e o topo (N molduras) compartilham a mesma disciplina de transform por camada.
- **Teto de 3 é decisão de produto/CPU**, não limite técnico — o contrato em array suporta mais; o número é ajustável no futuro sem mudar a arquitetura.
- **Single-tenant / LOCAL-ONLY preservado**: `frame_templates` segue sem `client_id`; o projeto permanece local-only (sem GitHub/deploy).
