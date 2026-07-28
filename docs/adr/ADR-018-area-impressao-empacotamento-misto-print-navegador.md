# ADR-018: Área de Impressão — empacotamento de tamanhos mistos + saída por impressão do navegador

## Status

accepted

## Context

Surge a feature "Área de Impressão": montar uma folha A4 (210×297 mm) com vários bottons — artes já geradas pelo lote mais eventual upload avulso — cada um com uma quantidade, organizados de forma otimizada e prontos para imprimir. O objetivo é o operador colocar diferentes tamanhos e quantidades numa mesma folha, imprimir e recortar.

Duas forças precisam ser resolvidas agora, antes de qualquer código:

1. **Como empacotar (nesting) peças de tamanhos mistos numa folha?** Os bottons são circulares e o diâmetro da arte segue a golden matrix definida no ADR-003 (`art_diameter_mm`): 32→44, 44→54, 58→70 mm. As artes prontas do lote são PNGs quadrados (círculo + linha de corte já embutida) servidos por signed URL (`printPngUrl`). O dono quer tamanhos diferentes convivendo na mesma folha, não uma folha por tamanho.

2. **Onde e como gerar a saída para impressão?** O front atual só tem `jszip` como dependência de manipulação de arquivos; não há lib de PDF nem rota de backend/Edge para essa feature. A fidelidade física é crítica: um botton de 44 mm precisa sair com 44 mm no papel, independentemente do DPI da impressora, para que a linha de corte case com o cortador circular.

O escopo é MVP local, priorizando algo determinístico, testável e sem novas dependências. Otimizações de densidade e formatos extras ficam para depois.

## Alternatives considered

### Decisão 1 — Algoritmo de empacotamento (tamanhos mistos)

#### Alt 1.1: Grade por tamanho / uma folha por tamanho
**Pros**:
- Trivial de implementar (grid fixo por diâmetro).
- Recorte previsível, tudo alinhado.

**Cons**:
- Não mistura tamanhos numa mesma folha.
- Desperdiça papel quando a quantidade de um tamanho não fecha uma folha inteira.

**Rejection reason**: o dono exige explicitamente tamanhos mistos juntos na mesma folha; esta opção contraria o requisito central da feature.

#### Alt 1.2: Skyline / MaxRects
**Pros**:
- Densidade de empacotamento significativamente maior que shelf.
- Padrão consagrado para bin packing 2D de retângulos.

**Cons**:
- Complexidade de implementação e de teste bem maior.
- Não determinístico de forma simples; mais difícil garantir invariantes em teste unitário.
- Ganho de densidade não é necessário para o volume do MVP.

**Rejection reason**: custo/complexidade desproporcional ao MVP. Fica registrada como evolução natural na Fase 2.

#### Alt 1.3: Empacotamento hexagonal de círculos
**Pros**:
- Densidade máxima teórica para círculos (aproveita o encaixe entre fileiras).

**Cons**:
- Recorte e, principalmente, a mistura de diâmetros diferentes ficam muito complexos.
- Difícil de tornar determinístico e testável com tamanhos mistos.

**Rejection reason**: complexidade incompatível com o MVP; a mistura de tamanhos quebra a regularidade que torna o hexagonal vantajoso. Fica para o futuro.

#### Alt 1.4 (ESCOLHIDA): Shelf / prateleira First-Fit-Decreasing (FFD)
**Pros**:
- Determinístico e simples de raciocinar.
- Fácil de testar (invariantes claras: sem sobreposição, gap respeitado, overflow gera nova página).
- Densidade boa o suficiente para o MVP.
- Trabalha sobre o quadrado envolvente de cada peça (lado = `art_diameter_mm` + gap), então lida com tamanhos mistos sem tratamento especial de círculos.

**Cons**:
- Densidade inferior a skyline/MaxRects e ao hexagonal (deixa espaço morto no topo das fileiras de peças menores).

### Decisão 2 — Saída / onde processar

#### Alt 2.1: PDF A4 via Edge / pdf-lib
**Pros**:
- Artefato PDF pronto e portável, independente do navegador.
- Controle fino do layout no servidor.

**Cons**:
- Exige rota de backend/Edge nova e/ou nova dependência de PDF.
- Mais trabalho para o MVP.
- O próprio diálogo de impressão do navegador já permite "Salvar como PDF".

**Rejection reason**: sobrecarga desnecessária no MVP; a saída PDF já é atingível pelo diálogo do navegador sem nova rota nem dependência.

#### Alt 2.2: PNG por página via Canvas
**Pros**:
- Gera imagem rasterizada de cada folha.

**Cons**:
- Desenhar as signed URLs em canvas exige CORS e arrisca tainting do canvas.
- Não imprime direto — o dono pediu para imprimir a partir da tela.
- Rasterizar em DPI fixo pode comprometer a fidelidade física.

**Rejection reason**: fricção de CORS/tainting, não imprime direto e conflita com o pedido do dono de imprimir da tela.

#### Alt 2.3 (ESCOLHIDA): Impressão do navegador via HTML/CSS em mm
**Pros**:
- Renderiza as folhas A4 em HTML/CSS no tamanho físico (unidades mm) e imprime pelo `window.print()` (`@page { size: A4; margin: 0 }` + `@media print`).
- Imprime direto na impressora; o diálogo do navegador ainda permite "Salvar como PDF".
- Sem nova dependência (front só tem `jszip`) e sem rota de Edge.
- Fidelidade física garantida pelas unidades mm — independe do DPI da impressora; as artes em 300 DPI cobrem a densidade.
- Usa `<img>` com signed URL posicionadas em mm — sem canvas, logo sem tainting.

**Cons**:
- Depende do comportamento do diálogo de impressão de cada navegador (margens/escala precisam ficar em 100% / "tamanho real").
- Menos controle programático sobre o artefato final do que um PDF gerado no servidor.

## Decision

1. **Empacotamento**: usar **shelf/prateleira First-Fit-Decreasing (FFD)** sobre o quadrado envolvente de cada peça (lado = `art_diameter_mm` + gap): expandir por quantidade, ordenar por diâmetro decrescente, preencher em fileiras (nova fileira quando não cabe na largura útil; nova **página A4** quando não cabe na altura útil).

2. **Saída**: renderizar as folhas A4 em **HTML/CSS no tamanho físico (unidades mm)** e imprimir pelo **`window.print()` do navegador** (`@page { size: A4; margin: 0 }` + `@media print`), sem lib de PDF e sem Edge.

3. **Corte**: sem marcas adicionais — cada peça já traz a linha de corte (ver ADR-003). A folha apenas posiciona as peças com gap de segurança (~4 mm) e margem (~5 mm), ambos parametrizáveis.

## Consequences

### Positive
- Núcleo isolado como função **pura `packSheet`** (em `core/print`), testável sem DOM: invariantes de sem sobreposição, gap respeitado, overflow gerando páginas e mm exato.
- A página de impressão usa `<img>` com signed URL posicionadas em mm, sem canvas — elimina tainting e problemas de CORS na renderização.
- Zero nova dependência no front e zero rota de backend nova para o MVP.
- Fidelidade física preservada pela âncora em mm + artes 300 DPI, independente do DPI da impressora.
- Coerente com o golden matrix já formalizado no ADR-003 e com os PNGs de corte embutido.

### Negative
- Densidade de empacotamento subótima (shelf FFD deixa espaço morto), aceitável no MVP mas potencial desperdício de papel em folhas muito heterogêneas.
- Saída depende da configuração correta do diálogo de impressão (escala 100%, sem "ajustar à página"); requer orientação ao operador.
- Sem artefato PDF canônico gerado programaticamente — reprodutibilidade da saída fica a cargo do navegador/operador.

### Neutral
- Faseamento: **MVP** = artes do lote + shelf FFD + impressão do navegador; **Fase 2** = upload avulso, formatos extras (A3/carta), e evolução do empacotamento para skyline/MaxRects ou hexagonal.
- Gap (~4 mm) e margem (~5 mm) ficam parametrizáveis, permitindo ajuste sem mudar o algoritmo.
- Referências: ADR-003 (print specs / golden matrix e linha de corte embutida); ADR-016/ADR-017 relacionados ao pipeline de arte/mockup, sem dependência direta com esta decisão.
