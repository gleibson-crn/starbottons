# ADR-029: Número MANUAL por botton e contador de evento persistente

## Status

accepted (substitui a origem do número do ADR-028)

## Context

O ADR-028 implementou numeração AUTOMÁTICA sequencial (1..N pela ordem de upload). O processo real do dono (casamento) é diferente: a cerimonialista distribui SENHAS (número) no convite; o convidado mostra "senha 6"; o dono produz o botton marcado com **6**. A ordem é ALEATÓRIA (a 6 sai antes da 1; a 1 pode nunca aparecer). O dono não gerencia a distribuição: só imprime o número informado e quer um CONTROLE de quantos produziu no evento.

## Decision

- **Número MANUAL por botton:** `seqLabel: string` (só dígitos, até 8; `''` = vazio), EDITÁVEL por item (input no card do lote). Substitui o `sequenceNumber` automático. O campo nasce VAZIO (sem auto 1..N). A Edge e `options.sequenceLabel` NÃO mudam; muda só a origem do número.
- **Cada número é ÚNICO:** repetir é provável engano. O app DESTACA o número repetido no card como alerta, mas NÃO bloqueia por duplicata.
- **Bloquear geração com número vazio:** com "numerar" ligado, "Gerar tudo" fica bloqueado enquanto algum item selecionado estiver sem `seqLabel`. Isso garante que todo botton saia numerado.
- **Contador de EVENTO persistente:** registro de senhas já PRODUZIDAS que ACUMULA ao longo do evento e SOBREVIVE a limpar/imprimir o lote (o lote tem teto `MAX_TOTAL_ARTES` e se produz em levas).
  - Persistido em **localStorage** (registro leve: conjunto de `seqLabel`s + contagem).
  - Incrementa quando um item com `seqLabel` fica `ready`. É idempotente por senha: regenerar a mesma não duplica.
  - Exibido no grid como "N bottons produzidos (evento)", com botão **"Zerar"** para o próximo evento.
- A logística de entrada da foto (Drive/WhatsApp para o PC da impressora) fica FORA do app.

## Alternatives considered

### Alt A: Manter auto 1..N com override manual
**Pros**: menos digitação quando a ordem coincide.
**Cons**: número errado sai impresso silenciosamente se o dono esquece de corrigir; a ordem é aleatória.
**rejection_reason**: risco de botton impresso com número errado sem aviso.

### Alt B: Contador só do lote atual
**Pros**: simples, sem persistência.
**Cons**: o lote limpa entre levas e o dono perderia a conta do evento.
**rejection_reason**: não atende o controle de produção do evento.

### Alt C: Contador no servidor (tabela de evento)
**Pros**: sincroniza entre máquinas.
**Cons**: exige migration e modelagem de evento.
**rejection_reason**: adiado; localStorage basta para o PC único da impressora (local-only).

## Consequences

**Positivas**
- Casa com o processo real (senha manual, ordem livre).
- O contador de evento sobrevive às levas.

**Negativas/neutras**
- localStorage é por navegador/PC e não sincroniza entre máquinas (aceitável: é o PC da impressora).
- "Produzido" = gerado (`ready`); não confirma a impressão física.
- Duplicata é só aviso, não bloqueio.

**Testes exigidos**
- `seqLabel` sanitiza (só dígitos, até 8).
- Auto-numeração removida.
- Bloqueio de "Gerar tudo" com número vazio.
- Duplicata detectada.
- Contador persiste e é idempotente por senha.
- Migração de snapshot: `number` para `string`.
