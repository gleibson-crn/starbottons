# ADR-033: Backend local (SQLite + arquivos) no lugar do Supabase

## Status

proposed

## Context

O [ADR-032](./ADR-032-migracao-para-app-desktop-exe.md) decidiu transformar o Star
Bottons em um app desktop (Electron) instalável para o usuário leigo, **sem Docker
nem Supabase**. Este ADR detalha **como** substituir o backend.

Hoje o app (Angular, no renderer do Electron) usa **Supabase** via `supabase-js`:
- **Banco (Postgres):** `print_specs`, `assets`, `generation_jobs`, templates de
  mockup/fundo/moldura, persistência de lote.
- **Storage:** upload das imagens de origem e das artes geradas (URLs assinadas).
- **Auth:** `auth.service` + `auto-login` (hoje o login é obrigatório porque as
  regras **RLS** do Supabase exigem um usuário autenticado).
- **Edge Functions (Deno):** `generate-art` e `style-transfer` (processamento de
  imagem no servidor).

Descoberta-chave: **"remover o login" não é separável de "remover o Supabase"** —
sem o Supabase/RLS, não há mais o que autenticar. Então auth sai junto com a troca
do backend, não antes.

Superfície a migrar: ~8 serviços de dados + 2 edge functions + 2 serviços de auth.

## Alternatives considered

### Alt 1: SQLite no processo MAIN do Electron + IPC — ESCOLHIDA
O processo **main** (Node) vira o backend: **SQLite** (better-sqlite3) para dados,
**arquivos locais** (`app.getPath('userData')`) para imagens, e as **edge functions
portadas para Node**. O renderer (Angular) fala com o main por um **bridge IPC**
(preload com `contextIsolation`), trocando as chamadas `supabase-js` por `window.api.*`.

**Pros**:
- **SQL** relacional: reaproveita o modelo das migrations (adaptado).
- As edge functions (TS/Deno) **portam naturalmente para Node** no main.
- Padrão robusto de app Electron; dados e arquivos ficam no PC do usuário.
- Sem conta, sem RLS, sem rede — o login some.

**Cons**:
- Precisa de uma camada **IPC + preload** (bridge renderer↔main).
- `better-sqlite3` é módulo nativo (rebuild p/ Electron via electron-rebuild).

### Alt 2: IndexedDB no renderer (sem processo main de dados)
**Pros**: sem IPC, sem módulo nativo; tudo no renderer, onde o app já vive.
**Cons**: IndexedDB é **NoSQL** — reescreve os serviços de um modelo relacional
para object stores; armazenar imagens grandes em IndexedDB é menos natural que em
arquivos. Menos robusto para o crescimento do app.

### Alt 3: SQLite em WASM no renderer (sql.js/wa-sqlite)
**Pros**: SQL sem processo main nem módulo nativo.
**Cons**: persistência manual (salvar o arquivo .sqlite), overhead de WASM, e as
edge functions ainda precisariam de um lar — acaba empurrando para o main mesmo.

## Decision

Backend local no **processo main do Electron**: **SQLite** (better-sqlite3) para
dados, **arquivos locais** para imagens, **edge functions portadas para Node**, e um
**bridge IPC** (preload) para o renderer. **Auth removido** (usuário local único,
sem RLS). O `main` do repositório segue no modelo atual (Supabase) e **distribuível**
até a migração estar validada; todo o trabalho vive no branch **`feat/local-backend`**.

### Ordem de migração (feature a feature, cada uma testável)

1. **Fundação:** preload + bridge IPC; SQLite inicializado com o schema (adaptado
   das migrations); pasta local de imagens. Um "adaptador local" implementa a mesma
   interface que os serviços hoje esperam.
2. **print_specs** (catálogo de tamanhos) — leitura simples, valida a fundação.
3. **Upload + Storage** → arquivos locais (upload.service, signed-url).
4. **Geração** → portar `generate-art` para o main (generation.gateway).
5. **Estilo** → portar `style-transfer` para o main (style-provider).
6. **Templates** (mockup/fundo/moldura) → SQLite + arquivos.
7. **Persistência de lote** → SQLite.
8. **Remover auth** (auth.service, auto-login, authGuard, login.page) — já sem RLS.
9. **Fechar:** remover `supabase-js`, `environment.ts` do Supabase, as migrations
   viram schema do SQLite; `up.mjs`/Docker saem do fluxo do app.

Cada passo mantém o app funcional (o renderer passa a chamar o adaptador local no
lugar do Supabase, um serviço de cada vez).

## Consequences

**Positivas**: app sem Docker/Supabase/conta; dados no PC do usuário; offline;
base pronta para o instalador `.exe` ([ADR-032] Fase 5).

**Negativas**: reescrita das camadas de dados/armazenamento/geração; IPC/preload a
manter; módulo nativo (rebuild). Trabalho de semanas, em branch.

**Neutras**: o front Angular é reaproveitado quase inteiro; as edge functions TS
portam para Node; o schema das migrations vira o schema do SQLite.
