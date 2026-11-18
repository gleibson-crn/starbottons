# ADR-026: ModalService genérico e proteção do lote em andamento

## Status

accepted

## Context

O dono perdeu a edição de 22 bottons. O link "Novo botton" leva ao upload, cujo "Continuar" executava `BatchStore.reset()` sem aviso, zerando o lote inteiro. O problema é de perda silenciosa de trabalho por um único clique, e precisa ser fechado agora porque o lote é o artefato central do fluxo (ADR-006, ADR-007, ADR-015).

Para avisar o usuário, o projeto só dispunha de `window.confirm`, que o dono rejeita (visual fora do sistema, sem estilização) e que comporta apenas duas opções. O caso exige 3 ou mais caminhos: dar andamento (impressão, download), continuar editando ou descartar.

Forças em jogo: o lote vive só em memória (`BatchStore`, com `File`s, transformações e signed URLs que expiram em 10 min); o projeto é LOCAL-ONLY e single-tenant; acessibilidade (foco, Esc, aria-modal) deve vir sem reimplementar.

## Alternatives considered

### Alt A: Diálogo específico do lote, sem ModalService

**Pros**:
- Escopo mínimo.

**Cons**:
- Um diálogo de escolhas já é ~80% de um modal genérico; haveria retrabalho.
- Os 3 `window.confirm` existentes continuariam.

**Rejection reason**: o dono pediu o ModalService como padrão do projeto; o genérico custa pouco mais e ainda remove os `confirm`.

### Alt B: Persistir o lote no servidor (`generation_jobs` já têm `batch_id`)

**Pros**:
- Permitiria "retomar o último lote".

**Cons**:
- Escopo bem maior; não evita o clique destrutivo em si.

**Rejection reason**: adiada. Vira backlog, não resolve o problema imediato.

### Alt C: Apenas bloquear o reset, sem opções

**Pros**:
- Trivial de implementar.

**Cons**:
- O usuário fica impedido, mas sem caminho para seguir.

**Rejection reason**: o dono quer poder dar andamento (download/impressão), não só ser impedido.

## Decision

1. **ModalService genérico** em `core/modal/modal.service.ts`, com host global `<app-modal-host>` em `app.ts` (ao lado do toast-host), baseado no elemento `<dialog>` nativo (`showModal()`: focus trap, Esc e aria-modal de graça). API: `showConfirm`, `showAlert` e `showChoices<T>` (lista de opções com variantes `primary`/`secondary`/`danger`; retorna o valor escolhido ou `null`). Substitui os `window.confirm` do projeto.
2. **Proteção do lote em dois pontos, com fonte única**: o clique em "Botton" no shell (antes "Novo botton") e o `continue()` do upload checam `BatchStore.hasWork()` (`items().length > 0`) antes de resetar. Havendo trabalho, abre-se o diálogo com: **Ir para impressão**, **Baixar ZIP**, **Continuar editando** e **Limpar e começar novo** (destrutiva, exige dupla confirmação).
3. **Persistência entre reload/fechamento do navegador fica fora de escopo** (exigiria IndexedDB, reidratar Files/transformações e re-assinar signed URLs de 10 min). Vai para o backlog. Por ora, um guard `beforeunload` nativo avisa antes de fechar com trabalho não salvo. **Emenda:** o ADR-027 implementa a persistência; o `beforeunload` passa a "avisa + persiste".

## Consequences

### Positive
- Nenhum clique isolado perde o lote.
- O fluxo de "dar andamento" (impressão/ZIP) fica explícito.
- ModalService reutilizável, com a11y garantida pelo `<dialog>`; elimina `window.confirm`.

### Negative
- Persistência real continua ausente: reload ainda perde o lote (mitigado só pelo `beforeunload`).
- Apenas um modal ativo por vez.

### Neutral
- Rótulo "Novo botton" passa a "Botton".
- Testes exigidos:
  - sem lote, "Botton"/"Continuar" vai direto ao upload, sem modal;
  - com lote, abre o modal de escolhas;
  - "Ir para impressão" e "Continuar editando" preservam o lote;
  - "Limpar e começar novo" pede dupla confirmação e só então chama `reset()`;
  - cobertura do ModalService (`showConfirm`, `showAlert`, `showChoices` com retorno do valor e `null` em Esc/cancelar).
