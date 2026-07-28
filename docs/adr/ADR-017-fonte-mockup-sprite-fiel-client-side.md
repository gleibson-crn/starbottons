# ADR-017: Fonte do botton no Mockup Contextual (sprite fiel client-side)

## Status

accepted

## Context

O **Mockup Contextual** (aplicar o botton sobre uma foto de cenário) foi **religado** ao fluxo unificado do grid/lote consolidado em **ADR-015**. A entrada agora é **por imagem** do grid: o botão **"Aplicar em cenário"** fica habilitado quando aquela imagem já tem **≥1 arte gerada** pela Edge. Para compor o botton sobre a cena, o mockup precisa de uma **imagem do botton** com forma de **círculo** e **transparente fora do círculo** — um overlay que possa ser posicionado, escalado e rotacionado sobre a foto sem cantos opacos.

A decisão é necessária **agora** porque, ao reativar o mockup dentro do grid, a pergunta central é **de onde sai a imagem do botton**. A opção aparentemente óbvia — reusar o PNG de impressão já produzido pela Edge — deixou de ser adequada após **ADR-016**: o PNG-origem agora é um **quadrado 100% opaco** com **fundo cobrindo os cantos** e, na saída de impressão, ganha **linha de corte** — ou seja, **não é um círculo transparente**. Usá-lo obrigaria a recortar ao círculo e remover a linha de corte no cliente, além de **depender do binário da Edge** estar pronto e baixado.

As forças em jogo: **fidelidade** entre o que o usuário vê no preview/geração e o que aparece no mockup (a mesma composição — cor de fundo, imagem de fundo com seu enquadramento e a arte do usuário com filtros); **transparência fora do círculo** para servir de overlay; **baixo acoplamento** (o mockup não deveria depender do binário da Edge nem da antiga `WorkflowStore` do fluxo single, já aposentada em ADR-015); e o dado necessário **já está em memória** no `BatchItem` (origem + `transform` + `filters`), tornando desnecessário um round-trip à Edge só para obter uma figura circular.

## Alternatives considered

### Alt 1 (escolhida): Sprite circular renderizado no cliente, fiel ao `editor-render`

Renderizar no **cliente** um **sprite circular** que **espelha o `editor-render.ts`** — a mesma composição do preview: **cor de fundo** (`transform.background`) + **imagem de fundo** (`transform.backgroundImage` com seu offset/scale/rotation) + **arte do usuário** (com `filters`), **recortado ao círculo** e **transparente fora** dele. O maior tamanho **selecionado/pronto** do item define **apenas a resolução** do sprite. A função (`renderMockupSprite`) lê o estado direto do `BatchStore` por `itemId`.

**Pros**:
- **Fidelidade total** ao preview/geração: inclui cor de fundo, imagem de fundo (com enquadramento) e filtros — o mockup mostra exatamente o botton que o usuário compôs.
- **Transparente fora do círculo** por construção — ideal para overlay sobre a foto do cenário.
- **Sem dependência do binário da Edge**: usa apenas origem + `transform` + `filters` já em memória no `BatchItem`.
- **Desacopla** o mockup da antiga `WorkflowStore` (aposentada em ADR-015): a fonte de estado passa a ser o `BatchStore` lido por `itemId`, alinhado ao fluxo único.

**Cons**:
- Cria um **segundo ponto de composição** no cliente que precisa ser mantido **em sincronia com `editor-render.ts`** — risco de divergência se a matemática/ordem de camadas evoluir num lugar e não no outro.

**Rejection reason** *(não se aplica — alternativa escolhida)*. Mitigação do único ponto fraco: **reaproveitar a mesma matemática/função de desenho da face** usada pelo `editor-render`, tratando-o como **ponto de manutenção único** em vez de duplicar a lógica.

### Alt 2: Reusar o `printPngUrl` da maior arte pronta

Aproveitar o **PNG de impressão** já gerado pela Edge para a maior arte pronta do item, recortando-o ao círculo no momento do mockup.

**Pros**:
- Reaproveita um artefato **já produzido** — nenhuma nova rotina de render no cliente.

**Cons**:
- Após **ADR-016**, o PNG-origem é um **quadrado 100% opaco** (fundo cobrindo os cantos) e a saída de impressão traz **linha de corte** — **não** é um círculo transparente; exigiria **recortar ao círculo** e **remover a linha de corte** no cliente.
- **Depende do binário da Edge** estar gerado e disponível — acoplamento que o mockup não precisa ter, já que os dados de composição estão em memória.
- **Pior fidelidade e maior acoplamento**: reprocessar um artefato de impressão para simular um overlay circular é mais frágil do que compor a partir da fonte.

**Rejection reason**: O artefato de impressão do ADR-016 é um quadrado opaco com linha de corte — inadequado como overlay circular transparente. Reaproveitá-lo aumentaria o acoplamento à Edge e degradaria a fidelidade, sem ganho que compense a rotina de recorte/limpeza necessária.

## Decision

A fonte do botton no Mockup Contextual é um **sprite circular renderizado no CLIENTE** que **espelha o `editor-render.ts`** — a mesma composição do preview: **cor de fundo** (`transform.background`) + **imagem de fundo** (`transform.backgroundImage`, com seu offset/scale/rotation) + **arte do usuário** (com `filters`), **recortado ao círculo** e **transparente fora** do círculo. O **maior tamanho selecionado/pronto** define **apenas a resolução** do sprite. A composição usa somente **origem + `transform` + `filters`** já em memória no `BatchItem`, lidos do **`BatchStore` por `itemId`** — **sem** depender do binário da Edge.

## Consequences

### Positive

- **Independência do binário da Edge**: o mockup compõe a partir de dados já em memória (origem + `transform` + `filters`), sem esperar/baixar o PNG da Edge.
- **Fidelidade ao preview/geração**: cor de fundo, imagem de fundo (com enquadramento) e filtros aparecem no mockup exatamente como no botton.
- **Overlay correto**: sprite transparente fora do círculo, pronto para posicionar/escalar/rotacionar sobre a foto do cenário.
- **Desacoplamento** do fluxo antigo: o mockup lê o **`BatchStore` por `itemId`**, encerrando a dependência da `WorkflowStore` (aposentada em ADR-015).

### Negative

- **Segundo ponto de composição no cliente** a manter em sincronia com `editor-render.ts`; se a lógica de camadas/geometria mudar em um lado e não no outro, o sprite do mockup diverge do preview.

### Neutral

- **Mitigação da manutenção**: manter `renderMockupSprite` **fiel** ao `editor-render` — idealmente **reaproveitando a mesma função de desenho da face** (ponto de manutenção único) em vez de duplicar a matemática.
- **Resolução dirigida pelo tamanho**: o maior tamanho selecionado/pronto define só a **resolução** do sprite, não a sua composição.
- **Relação com ADR-016**: é justamente a mudança do PNG-origem para **quadrado opaco com linha de corte** que torna o reuso do artefato de impressão inadequado como overlay circular.
- **Relação com ADR-015**: consolida o mockup no **fluxo único do grid** e na **fonte de estado única** (`BatchStore`), aposentando o acoplamento à `WorkflowStore`.
