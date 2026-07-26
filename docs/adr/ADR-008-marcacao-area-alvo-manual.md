# ADR-008: Marcação manual da área-alvo circular no mockup contextual

## Status

accepted

## Context

A feature de **mockup contextual** aplica a arte do botton sobre uma foto de cenário (a "cena": camiseta, mochila, lapela, mural etc.). Para isso, é preciso definir **onde** e com **qual tamanho/orientação** o botton redondo será composto sobre a cena — a "área-alvo". Essa área é circular, coerente com o produto (botton **redondo**).

A decisão é necessária agora porque define o contrato de entrada do compositor (ADR-009/ADR-010) e a forma de reuso de UI. O projeto **já possui** um `CanvasEditor` com `editor-transform` (posicionar, dimensionar e rotacionar objetos sobre um canvas), usado no fluxo de arte. As forças em jogo: **reuso máximo** do que existe, **previsibilidade** do resultado, cenário **single-tenant** client-side no v1, e o risco de que detecção automática seja frágil sob iluminação/sombra reais de foto.

Há dois modos de entrada de cena: **upload avulso** (o usuário sobe uma foto qualquer) e **template** (cena pré-cadastrada, ver ADR-011). A solução precisa cobrir os dois.

## Alternatives considered

### Alt 1 (escolhida): Marcação manual reusando o CanvasEditor/editor-transform

**Pros**:
- **Reuso total** do `CanvasEditor` e do `editor-transform` já validados — o usuário posiciona/dimensiona/rotaciona um **alvo circular** sobre a cena com a mesma mecânica que já conhece.
- **Previsível e robusto**: não depende de condições de iluminação/contraste da foto; funciona igual para qualquer cena.
- Cobre **upload avulso e template** com o mesmo componente; quando vem de **template**, o alvo já chega **pré-preenchido** com a geometria salva (ADR-011), reduzindo o trabalho a um ajuste fino opcional.

**Cons**:
- Exige uma ação manual do usuário por cena avulsa (posicionar o alvo).
- Depende de o usuário marcar com bom senso (alvo mal posicionado → composição ruim).

**Rejection reason** *(não se aplica — alternativa escolhida)*.

### Alt 2: Detecção automática por cor do "botton branco" na cena

**Pros**:
- Zero interação: o sistema encontraria sozinho a área-alvo (ex.: um botton branco fotografado como placeholder na cena).
- Fluxo mais rápido quando funciona.

**Cons**:
- **Frágil** sob iluminação/sombra/reflexo reais — branco vira cinza/creme, bordas se perdem.
- **Falsos positivos** (qualquer região clara e arredondada da cena) e falsos negativos.
- Custo de implementação/validação desproporcional ao ganho no v1.

**Rejection reason**: Baixa confiabilidade em fotos reais e risco de falsos positivos; fica reservada para **v2 como sugestão confirmável** (o sistema propõe, o usuário confirma/ajusta), não como marcação autônoma.

### Alt 3: Somente via template (sem marcação para upload avulso)

**Pros**:
- Simplicidade máxima: a geometria-alvo sempre vem pronta do template.
- Nenhuma UI de marcação a construir.

**Cons**:
- **Não cobre upload avulso** — o usuário não conseguiria compor sobre uma foto própria.
- Engessa a feature ao catálogo de templates cadastrados.

**Rejection reason**: Não atende ao requisito de compor sobre foto avulsa; limita demais o alcance da feature.

## Decision

A área-alvo circular é marcada **manualmente**, reusando o **`CanvasEditor`/`editor-transform`**: o usuário **posiciona, dimensiona e rotaciona** um alvo circular sobre a cena. Quando a cena vem de **template**, o alvo chega **pré-preenchido** com a geometria salva, restando apenas ajuste fino opcional.

## Consequences

### Positive
- Reuso integral de componentes já testados; sem UI nova de detecção.
- Resultado previsível, independente das condições de luz da foto.
- Um único fluxo cobre upload avulso e template.

### Negative
- Requer uma ação manual por cena avulsa; qualidade depende da marcação do usuário.

### Neutral
- **Gatilho para reabrir**: a **detecção automática (Alt 2)** volta como **sugestão confirmável** no v2, sempre com o usuário validando o alvo proposto.
- A geometria-alvo produzida aqui é o contrato de entrada do compositor (ADR-009) e o formato persistido em template (ADR-011).
