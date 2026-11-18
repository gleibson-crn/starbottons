# ADR-025: Moldura composta por camadas (camadas editáveis + PNG achatado como contrato do pipeline)

## Status

accepted (aditivo aos ADR-023 e ADR-024; não supersede nenhum)

## Context

O ADR-023 permitiu até 3 molduras empilhadas no botton, cada uma com enquadramento próprio e z-order. O ADR-024 acrescentou o enquadramento padrão por moldura (`default_framing` em `frame_templates`, colunas `default_offset_x/y`, `default_scale`, `default_rotation`, offset em fração do lado do editor). Em ambos, a unidade cadastrada na Curadoria (`/app/frames`) é **um único PNG** por moldura.

O dono quer agora, na tela de edição da moldura, **compor UMA moldura a partir de VÁRIAS camadas de imagem**: incluir camadas, ordenar o z-order (lista) e editar o enquadramento de cada uma. Hoje isso só seria possível empilhando molduras no botton, o que consome slots do teto de 3 e não gera uma peça reutilizável única.

Forças em jogo:

- O pipeline (botton, mockup, impressão e Edge `generate-art`) consome **1 PNG por moldura**, com guardas PNG-only, magic bytes e `FRAME_MAX_DIM=1000`. Mexer nesse contrato reintroduz complexidade e risco de divergência cliente↔Edge.
- O dono exige **reedição individual** de cada imagem da composição.
- Uma tentativa anterior de resolver variações de moldura com presets foi implementada e revertida; composição no servidor está descartada por esse histórico.
- LOCAL-ONLY, single-tenant.

## Alternatives considered

### Alt A (escolhida): camadas persistidas + PNG achatado (híbrido)

N camadas em `frame_template_layers` e, além delas, um PNG achatado (render da composição) gravado em `frame_templates.storage_path`.

**Pros**:
- Editável: reabrir recarrega as camadas.
- Pipeline e Edge inalterados: continuam recebendo 1 PNG por moldura.

**Cons**:
- Camadas e achatado podem divergir se algo falhar no meio do save.
- A cópia de PNG (ver sub-decisão) duplica bytes.

### Alt B: só achatar num PNG, sem guardar camadas

**Pros**:
- Modelo mais simples, sem tabela nova.

**Cons**:
- Perde a reedição individual das imagens.

**Rejection reason**: o dono exige poder editar cada imagem da composição depois de salva.

### Alt C: só camadas, compondo na hora na Edge

**Pros**:
- Fonte única da verdade (sem divergência camadas/achatado).

**Cons**:
- Muda a Edge e o render; reintroduz composição no servidor.
- Aumenta CPU do worker e o contrato `options.frames[]`.

**Rejection reason**: muda a Edge e reintroduz complexidade de composição no servidor, algo já revertido anteriormente (presets).

### Sub-decisão: reusar moldura cadastrada como camada (copiar vs referenciar)

- **Referenciar o `storage_path` do outro template**: rejeitado. Se a moldura-origem fosse editada ou excluída, a composição ficaria órfã ou mudaria sem aviso.
- **Copiar o PNG (escolhido)**: a camada é independente. Consequência aceita: editar ou excluir a moldura-origem depois **não** altera a composição. Custo: duplicação de bytes (aceitável em ambiente local, PNGs pequenos).

### Sub-decisão: teto de camadas

Teto de **8 camadas** por composição, para limitar custo de rasterização no cliente e tamanho da lista na UI. O teto de 3 do ADR-023 é do **botton** (slots), não da composição: uma composição de até 8 camadas ocupa 1 slot.

## Decision

A moldura passa a ter **N camadas editáveis** persistidas e um **PNG achatado** que é o contrato com o pipeline.

- **Uma moldura, 1 slot**: a composição é indivisível ao aplicar no botton e ocupa 1 dos 3 slots do ADR-023.
- **Origem das camadas**: subir PNG novo (`source='upload'`) ou reusar moldura cadastrada (`source='template'`), sempre **copiando o PNG** para uma camada independente; `origin_template_id` é só informativo (sem FK).
- **Schema** (nova migração):
  - `frame_template_layers`: `id uuid PK`; `template_id uuid NOT NULL REFERENCES frame_templates(id) ON DELETE CASCADE`; `position smallint NOT NULL` (0 = fundo) com `UNIQUE(template_id, position)`; `storage_path text NOT NULL` (PNG da camada no bucket `uploads`); `offset_x real`, `offset_y real` (fração do lado da composição), `scale real`, `rotation real`, com CHECKs iguais aos `default_*` da migração `20261017110000`; `source text` ('upload'|'template'); `origin_template_id uuid NULL`. RLS e GRANT idênticos aos de `frame_templates`.
  - `frame_templates.storage_path` passa a ser o **PNG achatado**. Opcionalmente `is_composite boolean` (ou contagem de camadas) para o selo "composta" na UI.
  - **Backfill**: cada template existente vira 1 camada (position 0, `storage_path` atual, enquadramento neutro). O `storage_path` do template segue apontando para o mesmo PNG (já é uma "composição de 1 camada"); nenhum arquivo é movido.
  - Teto de 8 camadas validado na aplicação (e, se viável, no banco).
- **Rasterização client-side**: canvas **1000x1000** (casa com `FRAME_MAX_DIM=1000` da Edge), fundo **transparente** (alfa no miolo revela a arte). Cada camada entra em COVER no quadrado e recebe seu enquadramento (offset em px = fração do lado x 1000, scale, rotation). **Sem clip circular** (o clip é do botton). Salvar re-rasteriza o PNG achatado.
- **Dois níveis de enquadramento, em duas abas** na tela de edição:
  - aba **"Camadas"**: monta a composição (lista com z-order, incluir/remover, enquadramento de cada camada dentro do quadrado);
  - aba **"Enquadramento no botton"**: o `default_framing` do ADR-024, isto é, como a moldura inteira entra no botton.
  - O `default_framing` é **preservado** ao salvar as camadas.
- **Ciclo de vida**: reabrir carrega as camadas; salvar grava camadas e re-rasteriza o achatado; excluir a moldura apaga os PNGs das camadas e o achatado (o `ON DELETE CASCADE` cobre as linhas, a remoção no Storage é explícita).
- **Edge inalterada**: `generate-art` continua recebendo `options.frames[]` com 1 PNG por moldura.

## Consequences

### Positive

- Molduras ricas, compostas de várias imagens, reutilizáveis como uma peça única.
- Pipeline (botton, mockup, impressão, Edge) inalterado: contrato de 1 PNG por moldura preservado.
- Reedição individual de cada camada.
- Copiar o PNG isola a composição de edições/exclusões da moldura-origem.

### Negative

- Duplicação de bytes pela cópia de PNGs.
- Camadas e achatado precisam ficar em sincronia: salvar re-rasteriza, e uma falha no meio do save pode deixá-los divergentes (mitigar gravando o achatado por último e tratando erro como save falho).
- Dois níveis de enquadramento (dentro da composição e no botton), mitigados pela separação em duas abas.
- Rasterização no cliente depende do canvas do navegador.

### Neutral

- Relação com ADR-023: a composição ocupa 1 dos 3 slots; o teto de 3 permanece no botton e as guardas PNG-only permanecem.
- Relação com ADR-024: `default_framing` continua válido e preservado.
- Edge `generate-art` sem mudança. Single-tenant / LOCAL-ONLY preservado.
- Testes exigidos: PNG achatado com alfa no miolo; backfill (1 camada por template existente, mesmo `storage_path`); teto de 8 camadas; regressão do teto de 3 molduras no botton; `default_framing` preservado ao salvar camadas.
