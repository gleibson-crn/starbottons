# ADR-031: Canal de atualização do app via repositório privado no GitHub

## Status

accepted

## Context

O Star Bottons é um app desktop local-only: um front Angular servido por `ng serve` e iniciado pelo atalho `start-app.ps1` (`npm run up`). Não há servidor próprio nem instalador. Hoje não existe canal de atualização. Cada nova versão exige que o dono rode `git pull`, `npm install` e `npm run models:fetch` na mão.

O código já está em um repositório PRIVADO no GitHub (`gleibson-crn/starbottons`, branch estável `main`, com push inicial feito). O dono quer atualizar com 1 clique. Ele também quer ser avisado quando houver versão nova, com as novidades. Isso é necessário agora porque o repositório existe e a cadência de entregas aumentou, o que torna a atualização manual propensa a erro e esquecimento.

Forças em jogo: o app é web (não Electron), roda localmente e dispensa infraestrutura de update própria. A credencial git já existe no Windows (credential manager), no atalho e no Node, mas não no navegador. O modelo de remoção de fundo (~86MB, ADR-030) não vai no git e é baixado por `models:fetch`. O `environment.ts` é mantido com skip-worktree e não pode ser sobrescrito.

## Alternatives considered

### Alt 1: Repositório privado + `git merge --ff-only` + auto-update no reinício (ESCOLHIDA)
**Pros**:
- 1 clique para o dono.
- Roda 100% local e reaproveita o git, a credencial e o `main` já existentes.
- Dispensa servidor de update e empacotamento.
- `--ff-only` torna a aplicação previsível e nunca cria merge nem perde trabalho.

**Cons**:
- A segurança do desktop passa a depender da segurança do repositório.
- Exige credencial git válida no Windows.
- Reaplica `npm install` e `models:fetch` a cada update.

**Rejection reason**: não se aplica (alternativa escolhida).

### Alt 2: GitHub Releases com assets empacotados + download/swap
**Pros**:
- Versões imutáveis e rastreáveis.
- Não executa `npm install` na máquina do dono.

**Cons**:
- Exige empacotar o build e manter um pipeline de release.
- Exige lógica de download e troca de arquivos (swap) com o app em execução.
- É mais pesado para um app que roda via `ng serve`.

**Rejection reason**: custo e complexidade desproporcionais para um app local de um único usuário, que roda a partir do código-fonte.

### Alt 3: Auto-updater estilo Electron (electron-updater)
**Pros**:
- Solução madura para apps desktop empacotados.

**Cons**:
- Pressupõe Electron/instalador.
- Adotá-lo exigiria migrar a arquitetura.

**Rejection reason**: o app é web rodando via `ng serve`, não Electron.

### Alt 4: Atualização 100% manual (`git pull` na mão)
**Pros**:
- Zero código novo e zero superfície de ataque adicional.

**Cons**:
- Fluxo de vários comandos, fácil de esquecer ou errar.
- Não avisa quando há novidades.

**Rejection reason**: o dono quer atualizar com 1 clique.

### Alt 5: Só aviso de novidades, sem aplicar ("opção A")
**Pros**:
- Simples e de baixo risco.
- Não executa código puxado automaticamente.

**Cons**:
- O dono ainda precisa aplicar o update manualmente.

**Rejection reason**: o dono quer aplicar a atualização de fato, não só ser avisado.

## Decision

Adotamos o repositório privado `gleibson-crn/starbottons` (branch `main`) como canal de atualização, com aplicação automática no reinício. No início, o `start-app.ps1` roda um `check` que executa `git fetch` e compara a versão local com a de `origin/main`. O resultado vai para um arquivo de status local. O navegador só lê esse arquivo e, havendo versão nova, mostra o pop-up "Nova versão disponível" com as novidades.

Ao clicar "Atualizar agora", o front chama um endpoint localhost que grava apenas um flag, e o app fecha. Na limpeza, o atalho vê o flag e roda `git merge --ff-only`, `npm install` e `npm run models:fetch`, e reabre o app já na versão nova. A checagem e a aplicação ficam no atalho/Node, que têm a credencial git. Se a árvore de trabalho estiver suja, o update é abortado com aviso, e nunca se usa `reset --hard`. O `environment.ts` (skip-worktree) é preservado no merge.

## Consequences

### Positive
- Atualização em 1 clique, com aviso das novidades.
- Tudo local, sem servidor de update próprio.
- Reusa o git, o `main` e a credencial já existentes.
- `--ff-only` e a recusa em árvore suja protegem o trabalho local, e o `environment.ts` é preservado.

### Negative
- A segurança do desktop passa a depender da segurança do repositório privado. O `npm install` executa scripts do que for puxado, então um comprometimento do repo ou da conta GitHub vira execução de código na máquina. É necessário proteger a conta (2FA) e a branch `main`.
- Exige credencial git válida no Windows (credential manager). Sem ela, o `check` falha em silêncio e o pop-up não aparece. Isso deve ser registrado em log, e o atalho não deve travar a abertura do app.
- O modelo de ~86MB é rebaixado via `models:fetch` após o pull, o que torna o reinício pós-update mais lento e dependente de rede.
- Árvore suja aborta o update, que então precisa ser resolvido manualmente.
- O endpoint de gravação do flag deve ser só-localhost (bind em 127.0.0.1) e gravar somente o flag, com caminho fixo e sem aceitar path vindo do cliente (sem path traversal). Ele também não deve executar comandos.

### Neutral
- Requer o campo de versão e o formato de "novidades" no repositório (por exemplo, `package.json` ou changelog) para a comparação e o pop-up.
- O fluxo depende de o `main` permanecer estável, pois tudo que entra nele chega ao desktop.
- A mudança afeta o `start-app.ps1` e os scripts Node (`check`), além de um pequeno endpoint localhost e do componente de pop-up no front.
