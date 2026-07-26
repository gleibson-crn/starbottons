# ADR-012: Geração/detecção de cena por IA (adiada)

## Status

proposed

## Context

Uma evolução natural do mockup contextual seria usar **IA** para (a) **gerar a cena** por prompt (ex.: "botton na lapela de um blazer em ambiente de escritório") em vez de exigir foto/template, e/ou (b) **detectar automaticamente** a área-alvo na cena (relacionado à Alt 2 do ADR-008). Este ADR registra a análise e a decisão de **adiar**, para não perder o contexto quando o tema voltar.

A decisão é necessária agora porque a expectativa de "IA que cria a cena" costuma surgir cedo, e é importante deixar explícitos os **bloqueios** e o **gatilho** de reabertura. Fato central: **Claude/Anthropic NÃO gera imagens** — geração de cena exigiria um **provedor externo de difusão**, o que traz **custo por imagem**, **gestão de chave/segredo**, **latência** e **direitos de imagem** (especialmente cenas com **pessoas**). No v1, ADR-008 já resolve a área-alvo por marcação **manual** e ADR-010 mantém tudo **client-side** sem backend novo — nada disso pressiona por IA agora.

## Alternatives considered

### Alt 1 (escolhida): Adiar geração/detecção por IA para v2+

**Pros**:
- Evita **custo por imagem**, **gestão de segredo** e **latência** enquanto não há demanda comprovada nem teto de custo definido.
- Foge do risco de **direitos de imagem de pessoas** em cenas geradas.
- Mantém o v1 simples: marcação manual (ADR-008) + colagem client-side (ADR-009/010) já entregam a feature.

**Cons**:
- Não há geração automática de cena nem detecção automática da área no v1.
- Fluxo depende de foto/template fornecidos pelo usuário.

**Rejection reason** *(não se aplica — alternativa escolhida)*.

### Alt 2: Integrar já um provedor externo de difusão

Provedores avaliados: **OpenAI gpt-image**, **Google Imagen**, **Stability**, **Replicate/fal**.

**Pros**:
- Cena sob demanda por prompt, sem depender de banco de templates ou foto do usuário.
- Diferencial de produto (gera cenário do nada).

**Cons**:
- **Custo por imagem** recorrente e variável; exige **teto de custo** definido antes de ligar.
- **Chave/segredo** de terceiro para gerir e proteger; **latência** de geração.
- **Direitos de imagem** — cenas com pessoas/marcas têm implicações legais.
- Complexidade de backend (a geração seria server-side, contrariando a simplicidade do ADR-010 no v1).

**Rejection reason**: Custo, gestão de segredo, latência e risco de direitos não se justificam **sem demanda comprovada e teto de custo aprovado**; fica reservada para reabertura futura.

### Alt 3: Detecção automática da área-alvo por visão computacional/IA

**Pros**:
- Elimina a marcação manual quando funciona (relaciona-se à Alt 2 do ADR-008).

**Cons**:
- Frágil em fotos reais (mesmo problema de iluminação/sombra do ADR-008); mesmo com modelo, precisa de **confirmação do usuário**.
- Esforço de integração/validação sem ganho garantido no v1.

**Rejection reason**: Mesma conclusão do ADR-008 — vira **sugestão confirmável** no futuro, não marcação autônoma; adiada junto deste ADR.

## Decision

**Adiar** geração de cena por IA e detecção automática da área-alvo para **v2+**. Registrar os provedores de difusão candidatos (**OpenAI gpt-image, Google Imagen, Stability, Replicate/fal**) e o **gatilho** de reabertura. Nada de IA de imagem entra no v1.

## Consequences

### Positive
- v1 fica livre de custo por imagem, segredos de terceiros, latência e risco de direitos de imagem.
- Decisão e trade-offs ficam documentados para retomada rápida.

### Negative
- Sem geração/detecção automática; o usuário fornece foto/template e marca o alvo manualmente (ADR-008).

### Neutral
- **Gatilho para reabrir**: **demanda concreta** por geração de cena **+ teto de custo por imagem aprovado** pelo dono. Ao reabrir, decidir provedor entre os candidatos e onde processar (provavelmente Edge server-side, conectando ao gatilho do ADR-010).
- Este ADR permanece **proposed** até esse gatilho; não bloqueia a entrega do v1.
