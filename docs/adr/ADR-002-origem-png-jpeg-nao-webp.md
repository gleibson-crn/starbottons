# ADR-002: Formato de origem PNG/JPEG (não WebP) para impressão

## Status

accepted

## Context

A imagem enviada pelo usuário é a fonte da arte que vai à gráfica. Precisamos escolher em qual formato essa imagem de **origem** é armazenada e processada. A geração da arte final ocorre na Edge Function em Deno (ver ADR-001), usando a biblioteca **ImageScript** para decodificar/compor a imagem.

A decisão é necessária agora porque define o pipeline de upload e o contrato de entrada da Edge Function — e porque ela **diverge conscientemente** de uma convenção estabelecida em outro projeto do dono.

Dois fatos forçam a decisão: (1) **fidelidade de impressão** — compressão com perda (lossy) introduz artefatos que degradam a arte impressa, especialmente em bordas e áreas chapadas; e (2) uma **restrição técnica concreta**: a lib ImageScript no Deno **não decodifica WebP**, então uma origem em WebP simplesmente não seria processável server-side.

**Divergência explícita com o Controle Fitness**: no projeto Controle Fitness, a prática é **comprimir tudo para WebP no upload** (otimização de peso/banda para imagens de UI/relatórios). Aqui essa prática **não se aplica à imagem de origem**, porque o objetivo é o oposto — preservar qualidade para impressão, não minimizar bytes de exibição. WebP fica restrito a thumbnail/preview.

## Alternatives considered

### Alt 1: WebP para tudo (mesma convenção do Controle Fitness)
**Pros**:
- Consistência com a prática de upload do outro projeto do dono.
- Arquivos de origem menores → menos armazenamento e banda.

**Cons**:
- WebP lossy degrada a fidelidade de impressão.
- **ImageScript no Deno não decodifica WebP** — inviabiliza o render server-side sem uma etapa extra de transcodificação.
- Otimização de peso é irrelevante para o volume single-tenant/interno deste projeto.

**Rejection reason**: Incompatível tecnicamente com o pipeline (ImageScript não lê WebP) e conflita com o requisito de fidelidade; a economia de bytes não é uma força relevante aqui.

### Alt 2 (escolhida): PNG/JPEG de alta qualidade na origem; WebP só em thumbnail/preview
**Pros**:
- PNG lossless preserva bordas/áreas chapadas; JPEG de alta qualidade cobre fotos com peso razoável.
- Diretamente decodificável pelo ImageScript no Deno.
- WebP continua útil onde faz sentido (thumbnails/preview leves), sem tocar na origem.

**Cons**:
- Arquivos de origem maiores que WebP (armazenamento/banda um pouco maiores).
- Diverge da convenção do Controle Fitness — exige documentar o porquê (este ADR).

## Decision

A imagem de **origem** é enviada e armazenada como **PNG (lossless) ou JPEG de alta qualidade**. **WebP** é usado **apenas para thumbnail/preview**. A imagem de origem nunca é transcodificada para WebP.

## Consequences

### Positive
- Fidelidade de impressão preservada.
- Compatível com ImageScript no Deno sem transcodificação.

### Negative
- Maior consumo de armazenamento/banda para a origem (aceitável no contexto single-tenant/interno).

### Neutral
- **Divergência deliberada** do padrão de upload WebP do Controle Fitness — registrada aqui para evitar que alguém "padronize" por engano e quebre a impressão.
- Se no futuro o pipeline mudar de biblioteca (ex.: uma que decodifique WebP) e a fidelidade permitir, esta decisão pode ser revisitada.
