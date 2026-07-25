# ADR-003: Sangria/DPI parametrizados em tabela `print_specs` (não hardcoded)

## Status

accepted

## Context

A geração da arte depende de parâmetros geométricos por **combinação modelo × tamanho** de botton: sangria (`bleed_mm`), área segura (`safe_mm`), diâmetro visível (`visible_mm`) e DPI alvo (`dpi_target`). Esses valores são usados em **dois lugares** que precisam concordar exatamente: o Angular (preview/enquadramento no Canvas) e a Edge Function (arte final) — ver ADR-001.

A decisão precisa ser tomada agora porque ela é a "matemática de layout compartilhada" citada como consequência do ADR-001: se cada lado tiver sua própria cópia dos números, o preview e a arte divergem. Além disso, o MVP começa só com formato redondo e poucos tamanhos (32/44/58mm), mas o dono deve poder **adicionar tamanhos/modelos novos sem redeploy de código**.

## Alternatives considered

### Alt 1: Hardcode em constantes no código
**Pros**:
- Mais simples de começar; nenhum acesso a banco para ler specs.
- Valores versionados junto ao código.

**Cons**:
- Duplicação inevitável entre Angular e Deno → risco de divergência preview×arte.
- Adicionar/ajustar tamanho ou modelo exige alterar código e **fazer deploy** (de dois artefatos).
- Sem fonte única da verdade; fácil os dois lados saírem de sincronia.

**Rejection reason**: Duplicação de constantes em dois runtimes é exatamente a causa-raiz da divergência que o ADR-001 pede para evitar, e trava a operação (todo novo tamanho vira deploy).

### Alt 2 (escolhida): Tabela Postgres `print_specs`, lida por Angular e Edge, com seed em migration
**Pros**:
- **Fonte única da verdade** consultada pelos dois lados → mesma geometria no preview e na arte.
- Adicionar tamanho/modelo é um INSERT — **sem deploy de código**.
- Seed inicial **versionado em migration**, então o histórico dos valores fica rastreável.

**Cons**:
- Uma leitura extra de banco no fluxo (cacheável; volume baixo).
- Precisa de disciplina para alterar specs via migration/seed, não por edição solta em produção.

**Rejection reason** *(não se aplica — alternativa escolhida)*.

## Decision

`bleed_mm`, `safe_mm`, `visible_mm` e `dpi_target` vivem numa tabela Postgres **`print_specs`**, chaveada por **modelo × tamanho**, lida tanto pelo **Angular** quanto pela **Edge Function**. O conjunto inicial de specs é entregue via **seed versionado em migration**.

## Consequences

### Positive
- Fonte única da verdade elimina a divergência de parâmetros entre preview e arte.
- Novos tamanhos/modelos entram por INSERT/seed, sem redeploy.
- Histórico de specs rastreável via migrations.

### Negative
- Leitura adicional de banco no fluxo de render (mitigável com cache; impacto baixo no volume interno).

### Neutral
- Alterações de spec devem seguir o fluxo de migration/seed para manter rastreabilidade.
- A tabela não elimina a necessidade de as **fórmulas** (mm→px, aplicação de sangria/safe) serem consistentes entre os dois runtimes — ela só garante que os **dados de entrada** são os mesmos.
