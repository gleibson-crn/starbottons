# ADR-024: Enquadramento padrão por moldura (offset normalizado em fração do lado do editor)

## Status

accepted (aditivo ao ADR-023; não o supera)

## Context

O ADR-023 tornou a moldura um sistema de camadas: `frameImages[]` (até 3), cada uma com enquadramento próprio (offset/scale/rotation) ajustável por gestos no editor do lote. Hoje, ao aplicar uma moldura da curadoria (`/app/frames`, tabela `frame_templates`) num botton, `FrameLayers.addTemplate` a coloca sempre em COVER (centralizada, 1x, 0 graus), e o usuário precisa reajustá-la manualmente a cada uso, mesmo quando a peça tem sempre o mesmo encaixe ideal (ex.: um ornamento que deve ficar deslocado e girado).

A necessidade surge agora porque o ajuste manual repetido é o principal atrito do fluxo de molduras depois do ADR-023. O dono quer definir, **por moldura**, um **enquadramento padrão**: na Curadoria, clicar numa moldura cadastrada abre uma tela de edição (igual ao "Ajustar" da aba Moldura) e o resultado vira o padrão daquela moldura. Ao aplicá-la num botton ela já entra posicionada assim, e o usuário ainda pode reajustar no botton. Uma tentativa anterior de resolver isso com presets de moldura foi implementada e revertida (o dono não aprovou); este ADR é uma decisão nova e independente dela.

Há uma força técnica central: o offset do editor é em **pixels do lado do canvas**, e esse lado varia (cerca de 280 a 520 px conforme o host: tela de Curadoria, editor do lote, etc.). Salvar px brutos faria a moldura entrar deslocada se o editor onde ela é aplicada tiver lado diferente do editor onde o padrão foi definido. Scale e rotation já são adimensionais. A Edge `generate-art` recebe o transform final por moldura (ADR-023) e não precisa saber da origem do padrão.

## Alternatives considered

### Alt A (escolhida): colunas de enquadramento em `frame_templates`

Quatro colunas na própria moldura: `default_offset_x`, `default_offset_y`, `default_scale`, `default_rotation`.

**Pros**:
- Simples: 1 linha por moldura, update direto, sem join.
- CHECKs por campo no banco garantem faixas válidas.
- Defaults (0, 0, 1, 0) mantêm as molduras existentes em COVER, sem backfill.

**Cons**:
- Quatro colunas "achatadas" na tabela.

**Rejection reason** *(não se aplica — escolhida)*.

### Alt B: uma coluna `jsonb framing`

**Pros**:
- Um único campo; extensível.

**Cons**:
- Sem CHECK por campo (validação teria de ser por função/CHECK complexo).
- Parsing e validação na app; contrato menos explícito.

**Rejection reason**: perde a validação declarativa por campo e esconde o schema num blob, sem ganho real para um dado fixo de 4 números.

### Alt C: tabela 1:1 separada (ex.: `frame_template_framing`)

**Pros**:
- Isola o enquadramento do cadastro da moldura.

**Cons**:
- Join desnecessário para um dado que é 1:1 com a moldura.
- Mais uma tabela, policies e migração para manter.

**Rejection reason**: complexidade sem benefício; o dado pertence semanticamente à própria moldura.

### Sub-decisão: unidade do offset

- **px brutos**: rejeitado. Quebra entre editores de lado diferente (a moldura entra deslocada).
- **mm**: rejeitado. Exigiria conversão px para mm que o editor não expõe neste ponto; a Edge usa mm, mas a conversão já ocorre no caminho de render, e antecipá-la aqui acoplaria a Curadoria a esse detalhe.
- **Fração do lado do editor (escolhida)**: independente do tamanho do host e simples de calcular.

## Decision

Guardar o enquadramento padrão **na própria moldura**, em 4 colunas de `frame_templates`, com o **offset normalizado como fração do lado do editor**.

- **Schema**: `default_offset_x real not null default 0`, `default_offset_y real not null default 0`, `default_scale real not null default 1`, `default_rotation real not null default 0`, com CHECKs: scale entre 0.2 e 8 (espelhando `SCALE_MIN`/`SCALE_MAX` de `editor-transform.ts`), rotation entre -180 e 180, offset entre -2 e 2 (em frações do lado).
- **Normalização**: ao salvar (`updateFraming`), `offset_frac = offset_px / editorSide`. Ao aplicar (`FrameLayers.addTemplate`), `offset_px = frac * editorSideAtual`, em vez do COVER fixo. O canvas é sempre quadrado, então o risco de distorção por usar um único lado é desprezível.
- **Tela de edição**: reusa o `CanvasEditor` em `layer='frame'` e o controller `FrameLayers`; nenhum gesto novo. Acessada ao clicar numa moldura em `/app/frames`.
- **Não retroativo**: lotes já salvos mantêm o enquadramento que têm, pois ele vive no `transform` do botton, não na moldura.
- **Edge inalterada**: `generate-art` continua recebendo `options.frames[]` com o transform final (ADR-023).

## Consequences

### Positive

- Molduras entram pré-ajustadas, eliminando o reajuste manual repetitivo.
- Pouco código novo: reuso de `CanvasEditor`, `FrameLayers` e dos gestos do ADR-023.
- Offset em fração é robusto a editores de tamanhos diferentes.
- Molduras existentes continuam em COVER pelos defaults, sem backfill.
- CHECKs no banco protegem contra valores fora de faixa.

### Negative

- O padrão não é retroativo: lotes já salvos não ganham o novo enquadramento.
- A tela de edição precisa de uma arte de fundo neutra (amostra gerada) para julgar o encaixe.
- Quatro colunas achatadas em `frame_templates`.

### Neutral

- Relação com ADR-023: aditivo; o sistema de camadas, z-order, teto de 3 e as guardas PNG-only permanecem. O ADR-022 segue superseded pelo ADR-023.
- Edge `generate-art` sem mudança; contrato `options.frames[]` idêntico.
- Single-tenant / LOCAL-ONLY preservado.
- Testes exigidos: `updateFraming` normaliza (px para fração); `addTemplate` denormaliza pelo lado atual do editor; molduras sem padrão continuam em COVER.
