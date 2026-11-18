# ADR-021: Style transfer por IA — Gemini via Edge Function (proxy server-side), OFF por default

## Status
proposed

## Context
O ADR-020 criou o extension point provider-agnostic (`StyleProvider` + registry, OFF
por default). Agora concretizamos o PRIMEIRO provedor real: edição de imagem
image-to-image via Google Gemini (família "Nano Banana", modelo de imagem do Gemini —
confirmar o id exato na implementação contra `ai.google.dev/gemini-api/docs/image-generation`).
Requisitos: a chave da API NUNCA pode chegar ao browser; o provedor deve ser trocável
(OpenAI depois) sem tocar features; a feature continua OFF por default (quebra o
LOCAL-ONLY — a imagem sai da máquina). Começa no tier gratuito do Google AI Studio
(sem custo dentro da cota); OpenAI fica para depois (pay-as-you-go).

Escopo de produto: os filtros são ESTÉTICAS GENÉRICAS aplicadas à foto do próprio
usuário (cartoon, aquarela, HQ, pop art, esboço + estéticas evocativas de rótulo
genérico como "Você Amarelo"/"Guerreiro Espacial"). Os prompts são server-side e
descrevem TRAÇOS VISUAIS — NUNCA citam franquia/marca (evita bloqueio do provedor e
reduz o risco de IP; estilo artístico não é protegível, personagens específicos sim).

## Alternatives considered

### Alt 1 (escolhida): Edge Function proxy — chave server-side
Nova Edge `style-transfer` (Deno) valida JWT, guarda a `GEMINI_API_KEY` em secret,
mapeia `styleId → prompt` server-side e chama o Gemini. O adaptador Angular
`GeminiEdgeStyleProvider` fala só com a Edge.
**Pros:** chave nunca vai ao cliente; prompts controlados no servidor (anti prompt
injection / proteção de IP); reusa padrões de `generate-art` (auth, validação,
orçamento, erro que não vaza); provedor trocável em 1 arquivo; kill-switch server-side
(sem secret → 503) independente da flag do cliente.
**Cons:** um hop extra (browser→Edge→Gemini) e uma Edge nova para manter.

### Alt 2 (rejeitada): client-direct — browser chama o Gemini com a chave
**Pros:** menos um hop; sem Edge nova.
**Cons:** a `GEMINI_API_KEY` teria de existir no bundle/config do cliente — QUALQUER
usuário a extrai do devtools e a usa/abusa (custo e abuso ilimitados). Sem controle
server-side de prompt (IP/marca) nem de validação. Quebra o modelo de ameaças.
**Rejection reason:** expor a chave de um serviço pago no cliente é inaceitável
(Information disclosure + Elevation of privilege no STRIDE); nenhum ofuscamento salva.

### Alt 3 (rejeitada): SDK do provedor no cliente
**Cons:** mesmo problema da chave + acopla o código a um SDK específico, contra a
premissa provider-agnostic do ADR-020.
**Rejection reason:** acoplamento + exposição de chave.

## Decision
Implementar a Alt 1. Edge `supabase/functions/style-transfer/` (espelha `generate-art`):
`requireUser(JWT)`, `assertSafeSource` (teto 24MP), mapa server-side de estilos
GENÉRICOS (sem franquia), chamada ao Gemini com header `x-goog-api-key` (secret
`GEMINI_API_KEY`, modelo em `GEMINI_MODEL`), orçamento de tempo ~45s com abort, erro
genérico que não vaza. Adaptador `GeminiEdgeStyleProvider` implementa `StyleProvider` e
só fala com a Edge; registrado no boot APENAS quando `environment.styleTransfer.enabled`.
Resultado EFÊMERO: vira upload tratado (Abordagem A, ADR-014), respeitando
`TREATED_MAX_SIDE=1280`; o pipeline de `generate-art` fica inalterado. Trocar/adicionar
OpenAI = novo client server-side implementando `ImageStyleProvider` + env, sem tocar
cliente/features.

## Consequences
### Positive
- Chave protegida no servidor; prompts e allowlist de estilos controlados server-side;
  provedor plugável; reuso máximo dos padrões de segurança de `generate-art`.
- Feature 100% OFF por default; exige flag do cliente E secret no servidor para ligar.
### Negative
- Uma Edge a mais para manter; um hop de latência extra.
- Depende de serviço externo pago e do formato de wire do Gemini (isolado em
  `gemini-client.ts`; reconfirmar o endpoint/modelo atuais na implementação).
### Neutral
- Saídas do Gemini podem carregar marca d'água (SynthID) — documentar ao usuário.
- Sem teto de custo rígido nesta fase (tier gratuito; decisão do dono).
- Rótulos de estilo são evocativos mas os prompts são genéricos (sem citar franquia).
