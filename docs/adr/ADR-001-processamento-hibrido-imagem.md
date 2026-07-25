# ADR-001: Processamento híbrido de imagem (preview no browser, arte de impressão server-side)

## Status

accepted

## Context

O Star Bottons precisa gerar dois artefatos a partir da imagem enviada pelo usuário: (1) um **preview/mockup** interativo, que o usuário manipula em tempo real durante o enquadramento manual, e (2) a **arte de impressão** final, de alta fidelidade, que vai para a gráfica. Esses dois artefatos têm requisitos opostos: o preview precisa ser rápido, barato e reativo (latência de milissegundos a cada ajuste); a arte final precisa ser determinística, de qualidade controlada e reprodutível, independente do hardware/browser do usuário.

A decisão precisa ser tomada agora porque ela define onde vive a "matemática de layout" (posicionamento, sangria, escala em px a partir de mm/DPI) e qual tecnologia de renderização cada camada usa — o que condiciona todo o resto do MVP.

Os tamanhos-alvo são pequenos (32/44/58mm → ~378/520/685px a 300 DPI), o que torna o render server-side barato o suficiente para caber numa Edge Function. A ferramenta é single-tenant e interna, então não há pressão de escala horizontal imediata.

## Alternatives considered

### Alt 1: Tudo client-side (Canvas no browser gera também a arte final)
**Pros**:
- Zero custo de compute no servidor; nenhuma infra extra.
- Uma única base de código de renderização (a do preview), sem divergência preview×arte.
- Latência mínima e experiência offline-friendly.

**Cons**:
- Resultado não determinístico: encoding de PNG, gerenciamento de cor e sub-pixel rendering variam por browser/OS/GPU — inaceitável para arte que vai à gráfica.
- Difícil garantir DPI/dimensões exatas e metadados corretos no arquivo final.
- Impossível evoluir para PDF/CMYK/ICC (ver ADR-004) sem bibliotecas server-side.

**Rejection reason**: A falta de determinismo e de controle de qualidade no arquivo final é incompatível com o requisito de fidelidade de impressão.

### Alt 2: Tudo em worker externo dedicado (preview e arte fora do browser)
**Pros**:
- Ambiente de render único e totalmente controlado (poderia usar Ghostscript, LittleCMS, ImageMagick).
- Caminho natural para CMYK/ICC e formatos avançados.

**Cons**:
- Preview interativo via round-trip de rede seria lento e caro — péssima UX no enquadramento manual.
- Exige provisionar e manter infra de worker + fila desde o dia 1, desproporcional para ferramenta interna single-tenant.
- Overkill para tamanhos pequenos com render sub-segundo.

**Rejection reason**: Custo/complexidade de infra desproporcional ao MVP e UX de preview ruim; fica reservado como plano de escala futuro (ver ADR-005).

### Alt 3 (escolhida): Híbrido — Canvas no browser + Edge Function (Deno + WASM)
**Pros**:
- Preview/mockup reativo e gratuito no client (Canvas).
- Arte final determinística e reprodutível numa Edge Function (Deno + WASM), próxima do Supabase.
- Custo baixo aproveitando os tamanhos pequenos; sem infra dedicada.

**Cons**:
- Duas implementações de layout (JS no browser + Deno na Edge) que precisam concordar.
- Limites de tempo/memória da Edge Function restringem tamanhos grandes (mitigado no ADR-005).

## Decision

Preview e mockup são renderizados **no browser via Canvas**; a **arte de impressão** é gerada **server-side numa Supabase Edge Function (Deno + WASM)**. Cada camada renderiza no seu ambiente ideal.

## Consequences

### Positive
- Preview interativo e barato; arte final determinística e controlável.
- Sem infra dedicada no MVP; usa Edge Functions já disponíveis no stack Supabase.
- Custo de compute server-side baixo devido aos tamanhos pequenos.

### Negative
- Risco de **divergência preview×arte final**: o Canvas e a Edge podem posicionar/escalar de formas ligeiramente diferentes.
- Manutenção de duas implementações de render.

### Neutral
- Exige uma **matemática de layout compartilhada** (mm→px, sangria, safe area, escala) como fonte única — parametrizada em `print_specs` (ver ADR-003) e idealmente extraída para lógica reutilizável entre Angular e Deno.
- A fronteira de tamanho suportado síncrono na Edge é tratada no ADR-005.