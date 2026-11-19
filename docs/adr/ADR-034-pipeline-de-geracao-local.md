# ADR-034: Pipeline de geração local (generate-art + style-transfer: Deno → Node)

## Status

proposed

## Context

Pelo [ADR-033], as três bibliotecas de curadoria (fundos, mockups, molduras) já
rodam no backend local (SQLite + arquivos) e o lote já era local (IndexedDB). A
**última dependência do Supabase** no app é o **pipeline de geração**:

- **Upload** da imagem de origem (bucket `uploads` + tabela `uploads`).
- **`generate-art`** (~2.400 linhas, Deno): compõe a arte final de impressão
  (origem + fundo + molduras, 300 DPI, PNG). Fluxo: `computeLayout(spec)` →
  baixa origem/fundo/molduras → `composeArtwork` (ImageScript/WASM) →
  `buildLayoutSvg` → `rasterizeSvg` (resvg/WASM) → grava o asset.
- **`style-transfer`** (Deno): aplica o efeito de estilo.

**Acoplamento:** o `generate-art` baixa a origem pelo `path` que o upload gera —
então upload e geração **andam juntos**. Se o upload for local mas a geração
continuar na nuvem, ela não acha a imagem.

Natureza do código (importante para a estratégia):
- **Puro e portável:** `geometry.ts`, `svg.ts`, `types.ts` e a LÓGICA de
  `image.ts` (composição) são TypeScript determinístico, sem Deno.
- **WASM:** `composeArtwork` usa **ImageScript**; `rasterizeSvg` usa **resvg**.
  Na Deno, `wasm-local.ts` embute os `.wasm` em base64 e **intercepta o fetch**
  (a lib busca os WASMs de deno.land). **No Node isso é mais simples:** os
  pacotes npm (`imagescript`, `@resvg/resvg-js`) trazem/empacotam seus WASMs
  nativamente — sem interceptação de fetch.
- **Deno/Supabase (o que muda):** `Deno.serve`/HTTP/JWT, `EdgeRuntime.waitUntil`
  + polling em `generation_jobs` (ADR-005), e `db.ts` (download/upload no Storage,
  `assets`, URLs assinadas).

## Alternatives considered

### Alt 1: Portar para o Node no processo MAIN do Electron + IPC — ESCOLHIDA
Levanta a computação (pura + WASM) para o main (Node), troca o I/O por SQLite +
arquivos locais, e roda **em processo** (sem HTTP/JWT/polling): o renderer chama
`window.sb.generate(...)` → main compõe e devolve o PNG (bytes). Upload migra
junto (origem → arquivo local + tabela `uploads` no SQLite).

**Pros**:
- **Reaproveita a computação provada** (geometria/SVG/composição) quase inteira.
- **WASM é mais fácil no Node** (imagescript + @resvg/resvg-js via npm; sem a
  gambiarra de fetch da Deno).
- Em processo: **offline, sem auth, sem polling** — mais simples que a Edge.
- Remove a ÚLTIMA dependência do Supabase → destrava remover o login e o .exe.

**Cons**:
- É o **maior esforço** da migração (~1 semana focada): portar módulos, validar
  o WASM no Node, reconstruir o I/O, fiar o IPC.
- Risco principal: **WASM rodar no Node** (ImageScript/resvg) — mitigado por um
  *spike* cedo (ver fases).

### Alt 2: Embutir um runtime Deno/edge no app
**Cons**: pesado (+ runtime no instalador), estranho para um desktop, e ainda
precisaria do I/O local. Rejeitada.

### Alt 3: Reescrever a geração no renderer (canvas/WASM no navegador)
**Pros**: parte do processamento já é client-side.
**Cons**: o PNG final 300 DPI + a rasterização de SVG (resvg) ficam melhores no
Node (main); reescrever a geometria arrisca perder paridade com o preview. O
main reaproveita o código existente com menos risco. Rejeitada.

## Decision

Portar `generate-art` e `style-transfer` para o **processo main do Electron
(Node)**, reaproveitando a computação pura + WASM (`imagescript`,
`@resvg/resvg-js`/`-wasm`), trocando o I/O por **SQLite + arquivos locais**
(`storage.cjs`), e expondo via **IPC** (`window.sb.generate`, `window.sb.style`).
O **upload** migra junto (origem → arquivo local; tabela `uploads` no SQLite).
Sai o HTTP/JWT/`generation_jobs`/polling (em processo = chamada direta, com
eventos de progresso se preciso). As edge functions continuam em `supabase/`
para o modo web até a remoção do login.

### Ordem (cada fase testável; o WASM é validado CEDO)

1. **Upload → local:** `storage.save` + tabela `uploads` no SQLite; IPC; ramo
   local no `UploadService`. (Sozinho ainda não gera — mas destrava o resto.)
2. **Spike WASM no Node (RISCO):** provar que `imagescript` compõe e
   `@resvg/resvg-js` rasteriza um PNG real no Node — ANTES de portar o resto.
3. **Portar a computação pura:** `geometry`, `svg`, `types`, `image`
   (composição) para `electron/backend/generate/` (quase cópia; trocar imports).
4. **Fiar a geração:** `generateArtwork` no main lendo origem/fundo/molduras dos
   arquivos locais e gravando o asset no SQLite+arquivo; IPC; ramo local no
   `generation.gateway`. Remover o polling (resposta síncrona/progresso).
5. **`style-transfer`:** mesmo caminho.
6. **Limpeza:** `generation_jobs`/polling fora do fluxo local.

## Consequences

**Positivas**: geração **offline, em processo, sem conta**; reaproveita a
computação provada; remove a última dependência do Supabase → habilita remover o
login (ADR-033) e o instalador `.exe` (ADR-032 Fase 5).

**Negativas**: é a maior fatia de trabalho; o WASM no Node é o risco (mitigado
por spike cedo); 2 dependências npm novas (imagescript, resvg).

**Neutras**: a lógica (geometria/SVG/composição) é reaproveitada; as edge
functions seguem em `supabase/` servindo o modo web até a remoção do login.
