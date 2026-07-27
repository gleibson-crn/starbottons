# ADR-015: Fluxo único — o Grid (lote) absorve o fluxo single

## Status

accepted

## Context

O app mantinha **DOIS caminhos de upload** que divergiam já na `upload.page`: quando o usuário subia **1 imagem** entrava no **fluxo SINGLE** (upload → `selection` → `editor`/`EditorPage` com enquadramento e as abas **Ajustar**/**Tratar** [filtros do ADR-014] → `generation`/`ProcessingPage` → `result` → "**Aplicar em cenário**"); quando subia **2+ imagens** entrava no **fluxo LOTE** (`/app/batch`: grid por imagem, múltiplos tamanhos por item, geração em massa, download em **ZIP**). A bifurcação `1 → single | 2+ → lote` vivia na própria `upload.page`, e o fluxo single era orquestrado por um **Stepper de 4 passos** apoiado na `WorkflowStore`.

A decisão é necessária **agora** porque o dono quer **UM fluxo só** — subir **1..N imagens** sem dois caminhos paralelos. Manter a bifurcação duplica superfície de UI, dobra o custo de cada nova feature (todo tratamento/ajuste precisa ser implementado e testado em dois lugares) e cria duas fontes de estado (`WorkflowStore` do single vs. `BatchStore` do lote) que tendem a divergir.

As forças em jogo: **consolidar em um único fluxo e uma única fonte de estado**; **não regredir o tratamento de 1 imagem** (os filtros da aba "Tratar" recém-introduzidos no ADR-014); **reaproveitar o máximo do que já está validado** (o grid já faz N imagens + múltiplos tamanhos + ZIP); e **delimitar o que fica para v2** para não travar a unificação (o "aplicar em cenário a partir de uma arte gerada" só existia no single).

## Alternatives considered

### Alt 1 (escolhida): O Grid absorve tudo (fluxo único = lote para 1..N)

O **GRID** (`features/batch` + `core/batch/BatchStore`) passa a ser o **FLUXO ÚNICO**, atendendo **1..N imagens**. A `upload.page` **sempre** envia ao grid (fim da bifurcação por quantidade). As pages do single (`selection`, `editor`/`EditorPage`, `generation`/`ProcessingPage`, `result`) e o **Stepper de 4 passos** são **REMOVIDOS**. Para não regredir o tratamento de 1 imagem, os **FILTROS/aba "Tratar"** são **portados** para o "Ajustar" do grid: o `BatchEditorDialog` ganha abas **Ajustar | Tratar**, e `BatchItem`/`BatchStore` ganham `filters` + `generationUpload` **por item**; a geração **reusa a Abordagem A/`TreatedUploadService`** (ADR-014).

**Pros**:
- **Reuso do grid** que já faz N imagens + múltiplos tamanhos + **ZIP** e geração em massa — **menor retrabalho**.
- **Fonte de estado única** (`BatchStore`), eliminando a divergência com a `WorkflowStore`.
- Preserva o tratamento de 1 imagem ao portar os filtros do ADR-014 para o grid (sem regressão da v1).

**Cons**:
- Precisa **portar os filtros** (aba "Tratar" → "Ajustar" do grid) e evoluir `BatchItem`/`BatchStore` com `filters` + `generationUpload` por item.
- **Adia** o "aplicar em cenário a partir de uma arte gerada" (mockup-from-art) para a **v2**.

**Rejection reason** *(não se aplica — alternativa escolhida)*.

### Alt 2: O Single absorve o multi

Manter o fluxo single como base e estendê-lo para lidar com N imagens (grid, múltiplos tamanhos, geração em massa e ZIP embutidos no single).

**Pros**:
- Preserva o "aplicar em cenário a partir do resultado" que já existe no single.

**Cons**:
- O single **não tem** grid, múltiplos tamanhos por item, geração em massa nem ZIP — tudo isso precisaria ser **reescrito** dentro dele.
- Descartaria o `BatchStore`/`features/batch` já validados, jogando fora trabalho pronto.

**Rejection reason**: O single não possui as capacidades centrais do lote (grid/ZIP/geração em massa); adotá-lo como base significaria **reescrever mais** e descartar o grid já validado.

### Alt 3: Novo fluxo do zero

Construir um terceiro fluxo unificado partindo do zero, sem reaproveitar nem o single nem o grid.

**Pros**:
- Liberdade para desenhar a UX ideal sem carregar decisões legadas.

**Cons**:
- **Descarta trabalho já validado** (grid + geração em massa + ZIP + filtros do ADR-014).
- Maior custo, prazo e risco de regressão em funcionalidades hoje estáveis.

**Rejection reason**: Descarta trabalho validado (grid, ZIP, filtros) sem ganho proporcional — custo e risco altos.

## Decision

O **GRID** (`features/batch` + `core/batch/BatchStore`) torna-se o **FLUXO ÚNICO**, atendendo **1..N imagens**; a `upload.page` **sempre** encaminha ao grid. As pages do single (`selection`, `editor`/`EditorPage`, `generation`/`ProcessingPage`, `result`) e o **Stepper de 4 passos** são **REMOVIDOS**. Os **filtros/aba "Tratar"** são **portados** para o "Ajustar" do grid (`BatchEditorDialog` com abas **Ajustar | Tratar**; `BatchItem`/`BatchStore` com `filters` + `generationUpload` por item; geração reusando a **Abordagem A/`TreatedUploadService`** do ADR-014) — v1, para **não regredir** o tratamento de 1 imagem. O **"Aplicar em cenário a partir de uma arte gerada"** fica para a **v2**; a **Curadoria de mockups** (`/app/mockups`) segue acessível pelo menu, e **`/app/mockup`** (aplicar) fica **dormente** até a v2 (`mockupGuard`/`WorkflowStore`).

## Consequences

### Positive
- **Um único fluxo** e **uma única fonte de estado** (`BatchStore`): menos superfície de UI e cada nova feature é implementada/testada em um só lugar.
- **Reuso** do grid já validado (N imagens, múltiplos tamanhos, geração em massa, ZIP) — menor retrabalho.
- **Sem regressão** do tratamento de 1 imagem: os filtros do ADR-014 passam a existir no grid (por item).

### Negative
- **Perda temporária** do "aplicar em cenário a partir do resultado" (só volta na v2).
- Custo de **portar os filtros** e evoluir `BatchItem`/`BatchStore` (`filters` + `generationUpload` por item) e o `BatchEditorDialog` (abas Ajustar|Tratar).

### Neutral
- **Remoção** das pages/rotas do single + Stepper; a `WorkflowStore` **deixa de ser usada** pelo fluxo principal (fonte única passa a ser `BatchStore`), permanecendo apenas ligada ao `/app/mockup` dormente.
- **`/app/mockups`** (curadoria) continua no menu; **`/app/mockup`** (aplicar) fica dormente até a v2 (`mockupGuard`/`WorkflowStore`).
- Referencia **ADR-014** (filtros — Abordagem A/`TreatedUploadService`).
