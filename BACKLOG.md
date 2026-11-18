# Backlog — Star Bottons

Rastreamento de débitos técnicos e pendências conhecidas. Projeto **local-only**
(não vai a GitHub/deploy). Contexto histórico mais amplo vive na auto-memória do
Claude; aqui ficam só itens **acionáveis**.

Prioridade: **P1** (fazer logo) · **P2** (quando conveniente) · **P3** (nice-to-have).

Criado em 2026-08-23 (ao encerrar a feature MOLDURA / ADR-022).

---

## Aberto

### BL-001 · ✅ FEITO (2026-08-24) · Decompor `batch-editor-dialog.ts`
Extraída a seção "Estilo com IA" para um componente-filho dedicado
`src/app/features/batch/ai-style-panel/ai-style-panel.{ts,html,scss}` (TS+HTML+SCSS
juntos) — resolveu `max-lines` do `.ts` **e** o budget de SCSS de uma vez, sem
mudança de comportamento (paridade: progresso, cache, revert, gating de créditos,
downscale 1536, cancelamento). Wiring: painel recebe `sourceImage`/`fileName`/
`originalFilters`/`originalStyle`, emite `resultChange`; o diálogo aplica na prévia
e lê `aiStyled`/`generationUpload` via `viewChild` no `onSave`. Spec migrada para
`ai-style-panel.spec.ts` + `batch-editor-dialog.wiring.spec.ts`.
- **Resultado:** lint 100% limpo, `batch-editor-dialog.scss` no budget, **423 testes verdes**, tsc/build OK.

### BL-002 · ✅ FEITO (2026-08-24) · Endurecer MIME no cliente com `sniffImageMime`
`save()` de moldura e fundo agora confere os magic bytes reais (`sniffImageMime`
sobre os 8 primeiros bytes) além do `file.type`: moldura exige PNG real; fundo
exige PNG/JPEG real. Recusa cedo, com mensagem clara, um arquivo renomeado. A Edge
continua revalidando por assinatura (defesa em profundidade). Teste de "PNG falso"
adicionado ao spec de moldura.
- **Arquivos:** `frame-template.service.ts`, `background-template.service.ts` (+ spec).

### BL-003 · ✅ FEITO (2026-08-23) · Testes do `style-provider` assumiam `enabled=false`
`registry.enabled()` e `GeminiEdgeStyleProvider.isConfigured()` liam
`environment.styleTransfer.enabled` **direto** (hoje `true`) → 5 testes falhavam.
Fix: ambos passam a ler via `APP_CONFIG` (token injetável já existente); as specs
proveem `APP_CONFIG` com o valor desejado. Suíte **419/419** verde; cobertura dos
dois estados (ON/OFF) adicionada em `registry.spec.ts`.

### BL-004 · ✅ FEITO (2026-08-24) · Budgets de bundle/estilo estourando
Budgets do `angular.json` ajustados ao tamanho real (local-only): `initial`
warning 500→600 kB e `anyComponentStyle` warning 4→6 kB; tetos de **erro**
mantidos (1 MB / 8 kB) como guarda-corpo. `ng build` agora **sem warnings**.

### BL-005 · ❌ REVERTIDO (2026-10-17) · Presets de moldura (sobreposição)
A feature de "presets de moldura" (salvar pilha de molduras sobrepostas, ADR-024 antigo)
foi **entregue e depois REMOVIDA a pedido do dono** — não agradou. Removidos: tabelas
`frame_presets`/`frame_preset_layers` (migração `20261017100000_drop_frame_presets.sql`),
`FramePresetService`, `frame-presets-panel`, `frame-preset-builder`, `frame-preset-thumb`,
os membros de preset no `FrameLayers` e o ADR-024 de presets. Em seu lugar entrou a edição
de **enquadramento padrão por moldura** (ver histórico). Reversão validada: 455 testes verdes.

---

### BL-007 · P3 · Endurecimentos da MOLDURA COMPOSTA (ADR-025)
Findings LOW da revisão (local-only/single-tenant; nenhum bloqueia):
- **F-001:** `saveComposition` faz delete+insert das camadas em 2 chamadas (sem transação);
  se o insert falhar, a moldura fica sem camadas e sobram PNGs órfãos (recuperáveis).
  *Fix:* RPC transacional `replace_frame_layers(template_id, jsonb)` (SECURITY INVOKER).
- **F-002:** `saveComposition`/`copyPng` confiam nos `storagePath` do cliente sem exigir
  prefixo (`frame-layers/` ou `<uid>/`); em single-tenant com bucket `using(true)` não é
  fronteira real, mas o cleanup de órfãos poderia apagar objeto de outra entidade.
  *Fix:* validar prefixo do path (e restringir policy do bucket se virar multi-tenant).
- **F-003 (informativo):** apaga objeto do Storage sem checar registro de upload correspondente
  (se houver tabela) — integridade, não segurança.

## Concluído (histórico recente)

- **Auto-atualização via repo privado** (ADR-031, nov/2026) — o app passou a se atualizar sozinho. Canal = repo PRIVADO `gleibson-crn/starbottons` branch **main** (local-only ganhou um remoto privado; sem deploy/nuvem). Boot: `start-app.ps1`→`update.mjs check` (git fetch + compara `APP_VERSION` vs origin/main; offline=silencioso) grava `scripts/.update-available`+`public/update-available.json`. Front (`UpdateService.checkOnBoot` no shell): pop-up "Nova versão disponível (vX) → Atualizar agora/Depois" (ModalService); "Atualizar" faz POST `127.0.0.1:4299/do-update` (`update-server.mjs`, grava só o flag) + `window.close()`. `start-app.ps1` na limpeza: `update.mjs apply` (`git merge --ff-only`, NUNCA reset --hard; preserva environment.ts skip-worktree; `npm install`+`fetch-models.mjs`) e RELANÇA 1× na nova versão; falha=popup, sem loop (anti-loop 24h). Aviso "atualizado" (A) complementar via `update-notice.service` (localStorage `sb.lastSeenVersion`), exclusivo de B no boot. `v{APP_VERSION}` no header. **Publicar versão:** bump `APP_VERSION`(app-version.ts)==`version`(package.json) + notas em `release-notes.ts` → push main. Gate: **637 testes** + tsc/lint (PowerShell), conferido. Segredos conferidos no push (só anon demo+WASM b64). **Pendências do dono (só com repo no ar):** teste real do ciclo N→N+1, offline, árvore suja; credencial git válida no Windows; aceitar/recusar `dependabot.yml`.
- **App desktop: auto-login + setup guiado + Sair limpo** (nov/2026) — 3 ajustes de empacotamento desktop. (1) **Login invisível:** `provideAppInitializer`→`AutoLoginService` reidrata/loga com `LOCAL_USER` (`core/auth/local-credentials.ts`) e abre direto em `/app/upload`; tela de login vira fallback (sem loop). (2) **`npm run setup`** (`scripts/setup.mjs`): 1 comando idempotente p/ máquina nova — confere Node≥22/Docker/Supabase CLI (avisa+para se faltar, não instala), install + db:start + db:reset (protege dados existentes, `--yes` força) + models:fetch + cria atalho. (3) **Botão "⏻ Sair"** no shell (ModalService; `window.close()` + fallback; NÃO faz signOut) + `start-app.ps1` reescrito: Chrome `--app` com perfil dedicado (`scripts/.chrome-profile`), aguarda fechar e limpa — `taskkill /T /F` do servidor + mata `node` da porta + `supabase stop` NA PASTA (nunca Docker, nunca `--all`; CF/Nexgency intactos). Gate: **609 testes** + tsc/lint, conferido via PowerShell. ⚠️ `npm test` só roda no **PowerShell** (Git Bash desta máquina quebra o vitest). **Pendências:** verificação manual do Sair no desktop real (abrir atalho→Sair→`docker ps` sem containers do SB, CF/Nexgency de pé); edge: Chrome stale no perfil dedicado faz o wait retornar cedo. **Em aberto (decisão do dono):** pop-up "sistema atualizado" no login/boot — A (só aviso de novidades por bump de versão, viável local) vs B (aviso + aplicar update, depende de canal de distribuição inexistente).
- **Remover fundo** (ADR-030, nov/2026) — botão **"Remover fundo"** no editor (aba Tratar, `features/batch/remove-bg-panel/`): recorta a(s) pessoa(s) de uma foto e deixa o resto transparente, para aparecer sobre o fundo do botton. **100% no navegador** (a foto NUNCA sai do PC; sem IA de nuvem/OpenAI). Modelo **ISNet general-use fp16** (DIS, **Apache-2.0** → comercial-OK) via **onnxruntime-web 1.31.1** (pin exato), WASM SIMD single-thread, em Web Worker (`cutout.worker.ts`/`run-cutout.ts`). Modelo+WASM servidos LOCALMENTE de `public/models`+`public/ort` (NUNCA CDN — Avast quebra download runtime), baixados por `scripts/fetch-models.mjs` (`npm run models:fetch`, idempotente+SHA-256). Pós-processamento puro `shared/imaging/cutout-postprocess.ts`: threshold de alfa (slider) + componentes conectados; mantém o maior E todo componente ≥15% do maior (`KEEP_COMPONENT_RATIO`) → cobre 2+ pessoas, descarta ilhas (reflexos). Pipeline: `item.cutout`/`cutoutUpload` vira fonte de geração (mantém original p/ desfazer; NÃO zera filtros ≠ aiStyled); alfa chega à face (Edge `composeLayer` já preserva, sem mudança). Atribuição em `THIRD_PARTY_NOTICES.md`. Gate: **603 testes** (15 novos), tsc/lint/build OK. **Gotchas:** fp16 = ~86MB (não 22MB; q8 46MB existe se incomodar), ~40s/foto (CPU 1 thread). **Follow-ups P3:** testar qualidade em foto de pessoa real (E2E usou ilustração); recorte na miniatura do card/Mockup Contextual (hoje mostram original); "remover de todos (lote)"; avaliar q8 46MB.
- **Número MANUAL (senha) + contador de evento** (ADR-029, nov/2026) — ajuste do ADR-028 após o processo real: o número NÃO é mais automático 1..N — o dono DIGITA a senha de cada botton (input no card, `item.seqLabel: string` só-dígitos ≤8, nasce vazio; sem `nextSequence`). Ordem livre. **Bloqueia** "Gerar tudo" se `numbered` e algum item sem número (`seqMissing` em `podeGerar`). **Alerta** de número repetido no lote (`duplicateSeqLabels`, borda warning no card; não bloqueia). **Contador de EVENTO persistente** (`EventTallyService`, localStorage `sb.event.tally`): Set de senhas produzidas (registra em `onSettled` quando a arte fica ready, idempotente por senha), acumula entre levas/limpezas; grid mostra "N bottons produzidos (evento)" + "Zerar" (ModalService). Migração snapshot legado `sequenceNumber:number`→`seqLabel:string`. Gate: **588 testes**. A Edge/`sequenceLabel` NÃO mudaram (só a origem do número).
- **Numeração de bottons para eventos** (ADR-028, nov/2026) — toggle "Numerar bottons" no upload imprime um número SEQUENCIAL na SANGRIA (área morta/traseira, 6h), para controle de evento (senha/ticket). Por IMAGEM (mesmo nº nos vários tamanhos), começa em 1, não renumera após gerar (remover deixa buraco). Render na Edge: dígitos **7-segmentos como `<rect>`** (resvg não tem fonte → `<text>` não renderiza; `<rect>` sempre sai), camada `numberLabel` em `svg.ts` entre `bleedLightenRing` e `cutLine`, garantido ENTRE `visibleRadiusPx` e `artCenter` (nunca invade a face). Contrato `options.sequenceLabel` (só-dígitos, sanitizado em `normalizeOptions`); `BatchStore.numbered` + `sequenceNumber` por item (persistido no snapshot BL-008); badge "Nº N" no card. Gate: **577 client + 58 Deno**; E2E real (PNG com nº ≠ sem nº). Fase 2: prefixo/nome do evento (exige fonte embutida).
- **Re-assinar artes sob demanda** (nov/2026) — signed URLs das artes expiravam em 10min com o app aberto (causa provável do "não foi possível adicionar à impressão" tardio). Fix híbrido: TTL 600→**14400s/4h** (`generation.gateway.ts` + `generate-art/db.ts`) + `GenerationService.freshPrintUrl(jobId)` re-assina no clique de download/impressão (`addToPrint` + `download-button [refresh]`). zip-export/batch-restore já re-assinavam. Gate: 567 testes + 51 Deno.
- **Persistência do lote entre sessões** (ADR-027, BL-008, nov/2026) — o lote agora SOBREVIVE a reload/F5/fechar o navegador. Via **IndexedDB** (`core/batch/idb.ts`+`batch-persistence.service.ts`+`batch-snapshot.ts`+`batch-restore.ts`): grava só JSON LEVE (a imagem original já está no bucket `uploads` — Blob só p/ upload pendente); ao reabrir `/app`, o shell PERGUNTA "Retomar o último lote?" (ModalService); no restore re-assina as artes `ready` (`fetchAssets→signRender`; preview do original via `signUpload` TTL 1h) e degrada p/ "regenerar" se o asset sumiu. TTL 7 dias, limpa no reset/logout, descarta se userId≠. Autosave debounced 500ms + flush no visibilitychange/beforeunload. Trilha 2 (IA) fora da v1. `flushPersist` com try/catch (best-effort). Gate: **561 testes** (15 de integração com `fake-indexeddb` REAL — IndexedDB nunca tinha rodado em teste). Risco pré-existente SEPARADO (não da BL-008): `printPngUrl` expira 10min sem re-sign sob demanda com o app aberto.

- **Proteção do lote + ModalService** (ADR-026, nov/2026) — o dono perdeu 22 bottons porque "Novo botton"→upload→"Continuar" fazia `BatchStore.reset()` sem aviso. Agora: "Novo botton"→**"Botton"**; com lote em andamento (`hasWork`), abre um **diálogo de decisão** (Ir para impressão / Baixar ZIP / Continuar editando / Limpar-e-começar-novo com dupla confirmação) em vez de apagar; rede de segurança no `continue()` do upload; link **"Bottons (N)"** no menu (não havia caminho de volta ao grid); `beforeunload` ao fechar com trabalho. Criado o **ModalService** genérico (`<dialog>` nativo, `shared/ui/modal-host/` + reexport em `core/modal`, host no app.ts): `showConfirm/showAlert/showChoices` — substitui `window.confirm` (os 3 existentes migrados). Gate: 525 testes verdes. Budget `initial` warning 600→700 kB (crescimento gradual; teto de erro 1MB mantido).
- **Economia de tinta na sangria** (out/2026) — a arte de impressão clareia a SANGRIA (anel fora do círculo de corte/visível, que dobra para a traseira e não se vê) misturando branco a 50% (`BLEED_LIGHTEN` em `generate-art/svg.ts`), reduzindo cobertura de tinta sem afetar a face. Feito via **overlay SVG** (anel `<path fill-rule=evenodd fill=#fff fill-opacity=0.5>` entre `visibleRadiusPx` e `artCenter`, antes da linha de corte) — cobre arte+fundo+cor sólida de uma vez, sem loop de pixel/CPU no worker, preserva o recorte. Sempre ligado, sem parâmetro novo (Edge só). Só gerações NOVAS. Prévia não muda (sangria não aparece na face). Gate: 51 testes Deno verdes. Follow-ups possíveis: ver o efeito na prévia (overlay no editor); aplicar em rotas fora da Edge (`avulso-art`); tornar a intensidade configurável.
- **Espelhar (flip) a arte do botton** (out/2026) — aba "Ajustar" do editor do lote ganhou "⇆ Espelhar horizontal" / "⇅ Espelhar vertical" (toggle). SÓ a arte (não fundo/moldura). `EditorTransform.flipH/flipV` (opcionais, `?? false`, sem migration); "Redefinir enquadramento" também limpa o flip. Paridade prévia↔mockup↔Edge: ordem canônica **flip ANTES do rotate** (client `drawArt`: translate→rotate→scale(flip)→drawImage; Edge `transformSource`: resize→flip→rotate). **Gotchas:** (1) ImageScript 1.3.0 usa `img.flip('horizontal'|'vertical')` — NÃO existe `flipHorizontal()`/`flipVertical()`; (2) `normalizeOptions` da Edge precisou copiar os campos novos (lição ADR-022). Gate: 495 client + 49 Deno verdes. E2E visual (prévia=impressão) pendente de teste no navegador.
- **Moldura composta por camadas** (ADR-025, out/2026) — na edição da moldura (Curadoria), aba "Camadas": compõe UMA moldura de até 8 imagens (subir nova / reusar cadastrada copiando o PNG), lista com z-order ↑↓ e edição individual de cada camada; salva as camadas (`frame_template_layers`) + um PNG achatado 1000² (o que entra no pipeline — Edge inalterada). Aba "Enquadramento no botton" = o ajuste do ADR-024. `copyPng` validado no Storage local real. Gate: 497 testes verdes, security aprovado. ⚠️ rasterização visual só testável no navegador. Endurecimentos LOW em BL-007.
- **Enquadramento padrão por moldura** (ADR-024, out/2026) — na Curadoria `/app/frames`, clicar numa moldura abre um editor (reusa o "Ajustar" da aba Moldura: `CanvasEditor` em `layer='frame'` + `FrameLayers`) sobre arte neutra; o ajuste (offset/zoom/giro) vira o padrão da moldura e é aplicado ao empilhá-la num botton (`addTemplate` denormaliza). Colunas `default_*` em `frame_templates` (offset = fração do lado do editor), `FrameTemplateService.updateFraming`, componente `frame-framing-editor`. Entrou no lugar dos presets (revertidos, BL-005). Edge case P3: moldura com `thumbUrl` nulo abre o editor sem moldura (Salvar é no-op) — raro, não bloqueia. Gate: 467 testes verdes.
- **Reenviar upload que falhou** (out/2026) — card com falha de upload (ex.: "JWT issued at future") agora mostra botão **"Reenviar"** que reusa o File original retido no `BatchStore` (Map id→File), sem o usuário remover/reselecionar nem reenviar as que já subiram. `retryUpload(id)` no store + output `uploadRetried` no card. (Causa comum do erro = relógio da VM Docker dessincronizado → `npm run fix:clock`.)
- **MOLDURA do botton** (ADR-022, ago/2026) — camada PNG sobre a arte, COVER fixo, PNG-only, curadoria `/app/frames`. Ver memória `starbottons-moldura-botton`.
- **Filtros de estilo por IA** (ADR-019/020/021) — Trilha 1 (pixel client) + Trilha 2 (OpenAI via Edge), modo por estilo, cache, molduras de prompt por franquia.
- **Fundo do botton** (ADR-016) — cor/imagem/templates como camada sob a arte.
