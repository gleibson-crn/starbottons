# ADR-020: Style transfer via provedor externo — interface provider-agnostic, DESLIGADA por default

## Status
proposed

## Context
O produto cogita "filtros de estilo" avançados (ex.: cartoon, aquarela por IA) que
só existem via style transfer de provedor externo pago (~US$0,003–0,20/imagem).
Isso quebra o princípio LOCAL-ONLY do Star Bottons: a imagem sai da máquina, exige
chave/internet e conta paga; e o Claude não gera imagens. É preciso decidir agora
como preparar o terreno SEM cablar provedor nem violar local-only por default.

## Alternatives considered

### Alt 1 (escolhida): interface StyleProvider provider-agnostic em core/, registry + DI token, DESLIGADA por default; só o extension point é construído
Definimos `StyleProvider`/`StyleProviderRegistry` em `core/style-provider`, com
flag de config default OFF e UI oculta enquanto não houver provedor configurado.
Nenhum provedor é implementado; estilos são genéricos (proibido nome de franquia).
**Pros:** prepara integração sem violar local-only; testável com null provider;
troca de provedor sem tocar features; decisões caras (conta/orçamento/IP) ficam
explicitamente com o dono.
**Cons:** código inerte até o dono habilitar; interface pode precisar ajuste
quando o provedor real for escolhido.

### Alt 2: integrar já um provedor concreto
**Pros:** feature pronta ponta-a-ponta.
**Cons:** quebra local-only por default; exige conta/chave/orçamento e aceite de
IP/privacidade que só o dono decide; acopla o código a um SDK específico.
**Rejection reason:** viola local-only e toma decisões (custo, privacidade, IP,
provedor) que são do dono, não da arquitetura.

### Alt 3: não fazer nada
**Pros:** simplicidade.
**Cons:** quando o dono decidir, não há extension point e a integração vira
retrabalho invasivo nas features.
**Rejection reason:** perde a oportunidade barata de isolar o boundary agora.

## Decision
Construímos apenas a interface `StyleProvider` + `StyleProviderRegistry` + DI token
em `core/style-provider`, com flag `environment.styleTransfer.enabled=false` por
default e UI renderizada só quando `enabled() && provider.isConfigured()`. Estilos
expostos são genéricos (nunca nomes de franquia). Ficam BLOQUEADOS no dono:
escolha/contrato de provedor, chave de API, orçamento por imagem, aceite de IP e
privacidade (a imagem sai da máquina), e o ligar do flag. Nenhuma imagem é enviada
a terceiros sem consentimento explícito.

## Consequences
### Positive
- Local-only preservado por default; boundary de segurança isolado atrás de flag.
- Integração futura sem retrabalho nas features; provedor plugável.
- Decisões de custo/IP/privacidade ficam explícitas com o dono.
### Negative
- Código inerte até habilitação; risco de ajuste na interface no provedor real.
### Neutral
- Ver ADR-019 (Trilha 1) para os estilos locais que NÃO exigem provedor externo.
