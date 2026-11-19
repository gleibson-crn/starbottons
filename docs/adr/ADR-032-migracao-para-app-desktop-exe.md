# ADR-032: Migração do Star Bottons para aplicativo desktop instalável (.exe)

## Status

proposed

## Context

O Star Bottons hoje é um **front Angular** servido por `ng serve`, com backend em
**Supabase local** (Postgres, Auth, Storage, Edge Functions) rodando em **Docker**.
O atalho `start-app.ps1` sobe `npm run up` e abre o **Chrome em modo `--app`**. Para
distribuir, a pessoa precisaria **clonar o repositório do GitHub** e instalar
**Docker + Node + Supabase CLI** — ferramentas de desenvolvedor.

O público-alvo real (quem produz bottons: ateliês, gráficas rápidas, pessoas que
vendem em eventos) é, em geral, **leigo em tecnologia**. Para essas pessoas, o
modelo atual é **inviável**: elas não sabem usar GitHub, Docker ou terminal.

Além disso, a embalagem atual (Chrome `--app`) gera problemas de produto que são
sintomas do mesmo fundo arquitetural — por exemplo, o Chrome **bloqueia
`window.close()`** numa janela `--app`, o que exigiu uma gambiarra (flag `.quit` +
o atalho matando a janela) para o botão "Sair" funcionar (ver v1.2.5).

O dono quer que o sistema continue **gratuito**, **rodando no PC do usuário** (seus
arquivos ficam com ele, sem nuvem, offline) e que o usuário **baixe e dê dois
cliques**, como qualquer programa. Isso é necessário agora porque o repositório já
é público (ver [[ADR-031]]) e a distribuição para o público final é o próximo passo.

Forças em jogo:
- O app usa **WASM pesado** (onnxruntime-web para remoção de fundo, ADR-030) e
  muito **canvas/OffscreenCanvas** — sensível ao motor de renderização.
- Boa parte do processamento **já é client-side** (remoção de fundo, composição).
- O auto-update via **repositório público no GitHub** (ADR-031) já existe e pode
  ser reaproveitado por um atualizador de instalador.
- A dependência de **Docker/Supabase** é o que impede o "dois cliques".

## Alternatives considered

### Alt 1: App Electron, backend local (SQLite + arquivos), sem auth — ESCOLHIDA
Empacota o front num **Electron** (Chromium embutido + processo Node). Remove
Supabase/Docker: **banco → SQLite**, **Storage → arquivos na pasta do app**,
**Auth → removido** (usuário local único), **Edge Functions → processo Node/WASM**.
Instalador via `electron-builder`; auto-update via `electron-updater` lendo as
releases do repo público.

**Pros**:
- **Mesmo Chromium** que o app já usa (`--app`) → WASM, canvas e geração funcionam
  **idênticos**; migração de **baixo risco**.
- Processo **Node** no main facilita portar as Edge Functions e usar SQLite.
- `electron-builder` gera **instalador Windows** de dois cliques; `electron-updater`
  dá **auto-update nativo** reaproveitando o conceito do [[ADR-031]].
- Janela **nativa**: "Sair"/X fecham de verdade (elimina a gambiarra do `.quit`).
- Mantém a filosofia: grátis, local, offline, dados do usuário no PC dele.

**Cons**:
- Instalador **~100 MB** (Chromium embutido) e maior uso de RAM.
- Precisa **acompanhar atualizações de segurança** do Chromium embutido.
- **Reengenharia** das camadas de dados/armazenamento/geração (semanas).

### Alt 2: App Tauri (Rust + WebView do SO)
**Pros**: instalador **minúsculo (~5 MB)**, baixo uso de RAM, nativo.
**Cons**: usa o **WebView2 (não o Chromium)** → risco de diferenças sutis com o
**WASM pesado** (onnxruntime) e OffscreenCanvas; exige **toolchain Rust**; ecossistema
menor para portar o backend. Maior risco de migração para um ganho de tamanho.

### Alt 3: Web app hospedado (SaaS)
**Pros**: **zero instalação** (só um link) — o mais fácil para o leigo.
**Cons**: **quebra** "roda no seu PC / seus arquivos são seus" (dados no servidor);
**custo mensal** de servidor (tensiona o "grátis"); exige **internet**; vira
multi-tenant (auth, isolamento, privacidade) — rearquitetura grande em outra direção.

### Alt 4: Empacotar Docker + Supabase num instalador
**Pros**: quase não mexe no código do app.
**Cons**: instalar Docker **não é** dois cliques para leigo (WSL2, peso de GBs,
licenciamento comercial); frágil. Não atende o objetivo. Rejeitada.

### Alt 5: Manter o modelo atual (clonar o repo)
**Cons**: só funciona para usuários técnicos. Não atende o público-alvo. Rejeitada.

## Decision

Migrar o Star Bottons para um **aplicativo desktop Electron**, instalável por `.exe`,
**sem Docker e sem Supabase**: dados em **SQLite + arquivos locais**, **sem login**
(usuário local único), geração **dentro do próprio programa**, e **auto-update
nativo** reaproveitando o repositório público de releases.

Tauri fica registrado como alternativa futura (se o tamanho do instalador incomodar),
a ser reavaliada só após a prova de conceito validar o WASM pesado.

### Plano em fases (para não ser um salto no escuro)

- **Fase 0 — Prova de conceito.** Empacotar o app atual num Electron (janela nativa,
  ícone, menu, Sair/X nativos), ainda apontando para o backend atual. Valida a
  tecnologia e o rendering do WASM/canvas. *(poucos dias)*
- **Fase 1 — Remover autenticação.** Tirar login/auto-login/`local-credentials` e o
  `authGuard`; assumir um usuário local único. Simplifica tudo abaixo.
- **Fase 2 — Banco local (SQLite).** Substituir as consultas Supabase (Postgres) por
  SQLite no processo main (via IPC) ou IndexedDB; portar o schema das migrations.
- **Fase 3 — Armazenamento local.** Trocar Supabase Storage por **arquivos na pasta
  de dados do app**; URLs assinadas → caminhos/`blob:` locais.
- **Fase 4 — Geração local.** Portar as Edge Functions (generate-art etc.) para o
  processo Node/main ou client; boa parte já é client-side.
- **Fase 5 — Instalador + auto-update.** `electron-builder` (instalador Windows) +
  `electron-updater` consumindo as releases do repo público. Assinatura de código é
  opcional (tem custo) e pode ficar para depois.

## Consequences

**Positivas**:
- Usuário leigo **baixa e dá dois cliques**; abre como programa normal.
- Dados **100% no PC** do usuário; **offline**; **grátis** (sem custo de servidor).
- Janela nativa resolve a classe de problemas da embalagem `--app` (ex.: "Sair").
- Auto-update nativo, reaproveitando o canal do [[ADR-031]].

**Negativas**:
- **Semanas** de trabalho; reescrita das camadas de dados/armazenamento/geração.
- Perde-se a conveniência do Supabase Studio/RLS em dev (aceitável: app local single-user).
- Instalador grande (~100 MB) e Chromium embutido a manter atualizado.

**Neutras**:
- O front Angular e o conceito de auto-update por GitHub são **reaproveitados**.
- A gambiarra do `.quit` (v1.2.5) vira desnecessária após a Fase 0 e pode ser removida.

## Pendências

- Confirmar início da implementação (esta ADR é `proposed`; a decisão de tecnologia
  está tomada, mas o dono pediu **só o plano por ora**).
- Decidir sobre assinatura de código do instalador (custo) antes da distribuição ampla.
