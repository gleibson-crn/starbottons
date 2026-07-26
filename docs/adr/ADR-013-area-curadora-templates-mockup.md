# ADR-013: Área curadora de templates de mockup (rota dedicada, desacoplada do botton)

## Status

accepted

## Context

A feature de mockup contextual (ADR-008 a ADR-011) permite **aplicar** a arte de um botton sobre uma foto de cenário e **"salvar como template"** a cena com a área-alvo já definida. Hoje, porém, isso só é possível a partir do **fluxo de aplicar** (rota `/app/mockup`), que é protegido pelo **`mockupGuard`** — este exige um **botton já gerado** presente no `WorkflowStore`. Ou seja: para cadastrar/curar uma cena, o usuário precisa antes gerar um botton, mesmo que a intenção seja apenas **montar a biblioteca de cenários**.

A decisão é necessária agora porque o dono pediu explicitamente uma **área dedicada para CADASTRAR e curar cenários** e **pré-definir a área-alvo SEM depender de um botton** — com as quatro operações de CRUD: **criar, listar, editar e excluir** templates. O status quo cobre apenas "salvar durante o aplicar", não uma curadoria standalone da biblioteca.

As forças em jogo: **desacoplar** a curadoria da geração de botton (propósitos distintos), **reusar** os componentes já existentes do mockup (não reescrever a UI de marcação/preview), **não introduzir migration** (tabela e bucket `mockup_templates` já existem — ADR-011) e **não sobrecarregar** a tela de aplicar com dois modos conflitantes de guard.

## Alternatives considered

### Alt 1 (escolhida): Rota dedicada `/app/mockups` desacoplada, protegida só pelo `authGuard`

**Pros**:
- **Desacopla** curadoria de geração: não exige botton no `WorkflowStore`, atendendo literalmente ao pedido do dono (criar/curar cena sem botton).
- **Reusa** os componentes existentes — `ScenePreview` (em modo `sprite=null`, exibindo um **disco placeholder translúcido** no lugar da arte), `SceneControls`, `SaveTemplateDialog` e `TemplateGrid` — sem reescrever a UI de marcação.
- **Sem migration**: estende o `ContextualTemplateService` apenas com `update()`; tabela/bucket `mockup_templates` já existem (ADR-011), sem mudança de schema/RLS.
- Separação de responsabilidades limpa: uma tela para **curar a biblioteca**, outra para **aplicar** ao botton.
- Descoberta natural: **card na tela inicial** + **atalho na aba Biblioteca** do fluxo de aplicar.

**Cons**:
- Exige um pequeno modo visual novo no `ScenePreview` (renderizar sem sprite, com disco placeholder).
- Mais uma rota para manter no roteador do app.

**Rejection reason** *(não se aplica — alternativa escolhida)*.

### Alt 2: Reusar `/app/mockup` com um "modo curador"

**Pros**:
- Nenhuma rota nova; toda a UI de mockup fica concentrada em uma tela.

**Cons**:
- O **`mockupGuard` exige um botton** no `WorkflowStore`, **acoplando** a curadoria à geração — exatamente o que se quer evitar; contornar o guard por um flag de modo o torna condicional e frágil.
- **Sobrecarrega** uma única tela com **dois propósitos** (aplicar ao botton vs. curar biblioteca), com estados e guards divergentes.

**Rejection reason**: Manter o guard de botton acopla curadoria à geração e contamina a tela de aplicar com um segundo fluxo de proteção/estado; viola a separação de responsabilidades pedida.

### Alt 3: Manter apenas o salvar-template pelo fluxo de aplicar (status quo)

**Pros**:
- Zero código novo; a capacidade de "salvar como template" já existe no fluxo de aplicar.

**Cons**:
- **Não permite curadoria standalone** da biblioteca (criar/editar/excluir cenas sem um botton) — que é o pedido do dono.
- Todo cadastro de cena fica refém de gerar um botton antes.

**Rejection reason**: Não atende ao requisito central (curar a biblioteca de forma independente); apenas mantém a limitação que motivou este ADR.

## Decision

Criar a **rota dedicada `/app/mockups`** para **curadoria** de templates de mockup (criar, listar, editar e excluir), protegida **apenas pelo `authGuard`** (não pelo `mockupGuard`). A tela **reusa** `ScenePreview` (modo `sprite=null` com **disco placeholder translúcido**), `SceneControls`, `SaveTemplateDialog` e `TemplateGrid`, e **estende** o `ContextualTemplateService` com `update()`. **Sem migration** — tabela/bucket `mockup_templates` já existem (ADR-011). Acesso via **card na tela inicial** e **atalho na aba Biblioteca** do fluxo de aplicar.

## Consequences

### Positive
- Curadoria da biblioteca de cenários fica **independente** da geração de botton (atende ao pedido do dono).
- **Reuso máximo** de componentes existentes e **zero mudança de schema/RLS** (só `update()` no service).
- Descoberta clara por card na home + atalho na Biblioteca; separação de responsabilidades entre curar e aplicar.

### Negative
- `ScenePreview` ganha um **modo visual sem sprite** (disco placeholder) a manter.
- Uma rota adicional (`/app/mockups`) no roteador do app.

### Neutral
- A permissão de acesso permanece a mesma do restante do app (**`authGuard`**, single-tenant); revisitar se o projeto evoluir para papéis/multi-tenant.
- `ContextualTemplateService` passa a expor CRUD completo (o `update()` completa create/list/delete já existentes), sem novo backend.
