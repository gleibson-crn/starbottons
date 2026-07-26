# ADR-010: Composição do mockup contextual no client (Canvas 2D)

## Status

accepted

## Context

Definidos a marcação da área-alvo (ADR-008) e o nível de realismo por **colagem plana + gloss/sombra** (ADR-009), falta decidir **onde** a composição do mockup contextual é executada: no **client** (Canvas 2D no browser) ou em uma **Edge Function** nova no servidor.

A decisão é necessária agora porque define a arquitetura da feature e se há mudança de backend. O projeto já estabeleceu no **ADR-001** um pipeline **híbrido**, em que a **arte de impressão** é renderizada server-side (Edge/Deno + ImageScript) por exigir fidelidade e formatos específicos. O mockup contextual é **diferente**: a **cena é apenas um backdrop de visualização**, não vai à gráfica. As forças em jogo: **custo/latência**, **evitar mudança de backend** desnecessária, o fato de que a **colagem plana do v1 é leve** (cabe em Canvas 2D) e a preferência por não subir a foto da cena ao servidor sem necessidade.

## Alternatives considered

### Alt 1 (escolhida): Composição client-side em Canvas 2D

**Pros**:
- **Coerente com o ADR-001**: server-side é para a arte de impressão; o mockup é visualização e **não precisa** da mesma rota.
- **Sem custo/latência de servidor** e **sem mudança de backend** — a colagem plana + gloss/sombra do ADR-009 é leve o suficiente para Canvas 2D.
- A **cena não sai do browser**: evita upload da foto, tráfego e questões de armazenamento/direitos da imagem no servidor.
- Preview **instantâneo e interativo** enquanto o usuário ajusta o alvo (ADR-008).

**Cons**:
- Limitado pela CPU/memória do dispositivo do usuário.
- Técnicas pesadas (warp/relight/lote) não caberão bem aqui no futuro.

**Rejection reason** *(não se aplica — alternativa escolhida)*.

### Alt 2: Edge Function nova `compose-mockup` (Deno/WASM)

**Pros**:
- Processamento centralizado e independente do dispositivo do usuário.
- Caminho natural para **warp/relight** (ADR-009 v2) e **composição em lote**.

**Cons**:
- **Mudança de backend** (nova Edge, deploy, contrato) desproporcional ao v1.
- Exige **subir a cena** ao servidor: custo, latência e armazenamento/direitos de imagem.
- Duplica no servidor um trabalho que o Canvas 2D já faz de graça para colagem plana.

**Rejection reason**: Introduz custo/latência e mudança de backend sem necessidade no v1; **adiada para v2**, quando surgirem **warp/relight ou composição em lote** que justifiquem o processamento server-side.

## Decision

A composição do mockup contextual é feita **no client, em Canvas 2D**, coerente com o papel de **visualização** da feature e com o ADR-001. **A cena não é enviada ao servidor** no v1. Uma Edge Function `compose-mockup` fica **adiada para o v2**.

## Consequences

### Positive
- Zero mudança de backend; sem custo/latência de servidor; preview instantâneo e interativo.
- A foto da cena permanece no browser, evitando tráfego e armazenamento desnecessários.

### Negative
- Desempenho depende do dispositivo do usuário; inadequado para técnicas pesadas futuras.

### Neutral
- **Gatilho para reabrir**: criar a Edge `compose-mockup` quando entrarem **warp/relight (ADR-009 v2)** ou **composição em lote** que estourem o orçamento do Canvas 2D no client.
- Note-se que a **imagem de origem da arte** continua server-side (ADR-001/ADR-002); esta decisão vale apenas para o **backdrop de visualização**.
