# ADR-027: Persistência do lote no cliente (IndexedDB)

## Status

accepted

## Context

BL-008: o lote (`BatchStore`, só em memória) se perde num F5 ou ao fechar o navegador. O ADR-026 deixou a persistência fora de escopo e mitigou só com `beforeunload`. O dono pediu poder retomar o último lote.

Achado-chave: a imagem original já fica no bucket `uploads` do Supabase após o upload. Assim, basta persistir um JSON leve com referências, sem duplicar os binários. O projeto é LOCAL-ONLY e single-tenant.

## Alternatives considered

### Alt A: localStorage
**Pros**: API trivial.
**Cons**: não guarda Blob; cota de ~5 MB.
**rejection_reason**: não atende o fallback de Blob e estoura a cota.

### Alt B: Persistir no servidor (tabela `batches`; o `batch_id` já existe nos jobs)
**Pros**: sobrevive a trocar de máquina/navegador.
**Cons**: exige migration + RLS; mais pesado.
**rejection_reason**: adiado; projeto local-only não precisa disso agora.

### Alt C: Biblioteca `idb`
**Pros**: API mais ergonômica.
**Cons**: dependência extra para 2 stores e 3 operações.
**rejection_reason**: um wrapper cru (~60 linhas) basta.

### Alt D: Reidratar automaticamente
**Pros**: zero atrito.
**Cons**: quem abre o app para um botton novo cairia num lote velho.
**rejection_reason**: surpreende o usuário; a retomada deve ser escolha explícita.

## Decision

Persistir o lote no cliente via **IndexedDB** (Alt escolhida: wrapper cru, 2 stores).

1. **JSON leve**: metadados + referências (`upload.path`, ajustes, `jobId` das artes `ready`). O **Blob** vai ao IndexedDB só como fallback para itens com upload pendente/falho.
2. **Não persistir**: `printPngUrl` (signed, expira em 10 min; re-assina na volta), tokens, PII, `previewUrl`.
3. **Reidratação com pergunta**: `ModalService.showChoices` "Retomar o último lote de N bottons?"; nunca automática.
4. **Re-assinatura**: artes `ready` voltam via `jobId` -> `fetchAssets` -> `signRender`. Se o asset sumiu, a arte degrada para "precisa regenerar" (não trava).
5. **Higiene**: TTL de 7 dias; limpar no `reset()`/logout; descartar snapshot de `userId` diferente. `generating` vira `idle` ao serializar (retomável pelo `jobId`).
6. **Fora da v1**: trilha 2 (`aiStyled`), que está desligada. Entre abas: last-write-wins.

O `beforeunload` do ADR-026 passa a "avisa + persiste".

## Consequences

### Positive
- O trabalho sobrevive a reload/fechamento.
- IndexedDB leve: só JSON no caminho feliz.

### Negative / neutras
- Depende do Supabase local no ar (preview re-assinado).
- Não sobrevive a trocar de navegador/máquina (seria a Alt B).
- Last-write-wins entre abas.
- Geração em voo morre no F5 (`generating` -> `idle`).
- Risco: se o bucket `uploads` tivesse limpeza automática, o preview re-assinado falharia (não há cleanup configurado hoje).

### Testes exigidos
- Serializador: Set<->array, descarta `previewUrl`/`printPngUrl`, `generating` -> `idle`.
- Restore: re-sign ok/falha/asset ausente, TTL vencido, `userId` diferente.
