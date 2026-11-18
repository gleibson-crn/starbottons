# Rodando o Star Bottons localmente

Guia para subir o projeto **100% na sua máquina** (sem nuvem, sem GitHub).
O app é Angular + Supabase local (via Docker).

## Pré-requisitos (instalar uma vez)

- **Docker Desktop** (rodando) — o Supabase local sobe em containers.
- **Node.js** (18+; testado com 24) e **npm**.
- **Supabase CLI** (`supabase --version`).
- Dependências do projeto: na raiz, rode `npm install`.

## Primeira vez (setup)

**Um comando** (recomendado, após instalar os pré-requisitos acima):

```bash
npm run setup               # confere pré-requisitos, instala deps, sobe o Supabase,
                            # aplica migrations+seed, baixa o modelo do "Remover fundo"
                            # (~86MB) e cria o atalho na área de trabalho. Idempotente.
```

> `npm run setup` **não** instala Docker/Node/Supabase CLI — ele avisa o que falta e para.
> Se o banco já tiver dados, ele pergunta antes de recriar (`npm run setup -- --yes` força).

Ou manualmente, passo a passo:

```bash
npm install                 # dependências do app
npm run db:start            # sobe o Supabase local (baixa imagens Docker na 1a vez — demora)
npm run db:reset            # aplica as migrations + seed (cria tabelas, buckets, print_specs)
```

O `environment.ts` (em `src/environments/`) já está preenchido com as credenciais
do Supabase local — que são **fixas/padrão do Supabase CLI**, então valem sempre
que o `db:start` sobe. Ele é `skip-worktree` (suas edições locais não entram no git).
Se algum dia precisar reeditar: `git update-index --no-skip-worktree src/environments/environment.ts`.

### Login (automático)

Como é uma ferramenta local de uso próprio, o app faz **login invisível**: ao abrir,
entra sozinho com o usuário fixo local (`teste@starbottons.local`) e cai direto no app —
**sem tela de login**. A tela de login só aparece como **fallback** se o auto-login falhar
(ex.: Supabase fora do ar). As credenciais ficam em `src/app/core/auth/local-credentials.ts`.

Se precisar de outro usuário (opcional), crie **pelo Supabase Studio**
(`http://127.0.0.1:54323` → *Authentication* → *Users* → *Add user* → **Auto Confirm User**).

## Dia a dia (rodar o app) — UM comando

```bash
npm run up
```

Esse é **o** comando: sobe a aplicação **100%**, na ordem certa, mesmo depois que
a máquina reinicia. Ele faz tudo sozinho:

1. **Docker Desktop** — se o engine estiver desligado, inicia e espera ficar pronto;
2. **Supabase local** (`supabase start`, idempotente);
3. **Relógio da VM** (`fix:clock`) — evita o erro "JWT issued at future" no login/upload;
4. **Edge + Web** (`npm run dev`) — com **auto-restart do edge** (que às vezes cai
   com "unexpected EOF") sem derrubar o app.

Quando terminar de subir, abra **http://localhost:4200**. Encerre com `Ctrl+C`.

> ⚠️ `npm start` sozinho sobe **só o front** (`ng serve`) — a geração/exportação
> falha porque a Edge e o Supabase não estão no ar. Use `npm run up`.

### Variações (quando já tem Docker/Supabase de pé)

```bash
npm run dev        # só edge + app juntos (não mexe em Docker/Supabase/relógio)
```

Ou separado, em 2 terminais:

```bash
npm run edge       # Edge Functions  (http://127.0.0.1:54321/functions/v1)
npm start          # app Angular     (http://localhost:4200)
```

## Endereços úteis

| O quê | URL |
|---|---|
| App | http://localhost:4200 |
| Supabase Studio (banco, storage, usuários) | http://127.0.0.1:54323 |
| API / Storage / Auth | http://127.0.0.1:54321 |

## Parar tudo

**Pelo atalho (recomendado):** clique no botão **⏻ Sair** dentro do app (ou feche a janela
do Chrome). Isso encerra o servidor (Edge + web) **e** roda `supabase stop` só deste projeto,
liberando RAM. O **Docker Desktop e os outros projetos** (Controle Fitness, Nexgency) ficam
intactos — o Sair **nunca** desliga o Docker inteiro.

**Manual** (quando subiu com `npm run up`/`npm run dev` no terminal):

```bash
# Ctrl+C encerra o `npm run dev` (Edge + app)
npm run db:stop     # para os containers do Supabase (os dados ficam salvos)
```

## Atualizações (automáticas)

O app agora se atualiza sozinho a partir do repositório **privado** no GitHub
(`gleibson-crn/starbottons`, branch `main`). Ao abrir pelo atalho, se houver uma
versão nova, aparece um pop-up **"Nova versão disponível"** com as novidades e o
botão **Atualizar agora** — ao confirmar, o app fecha, baixa a nova versão
(`git merge --ff-only` + `npm install` + modelo) e **reabre já atualizado**.
Requisito: o Git precisa estar autenticado no Windows (credential manager); sem
isso a checagem falha em silêncio e o pop-up não aparece. Nunca usa `reset --hard`
e **nunca** desliga o Docker. A versão atual aparece como `vX.Y.Z` no cabeçalho.

> Publicar uma versão nova (quem mantém o código): aumentar `APP_VERSION` em
> `src/app/core/app-version.ts` **e** `version` no `package.json` (iguais — há teste
> que cobra isso), adicionar as novidades em `src/app/core/release-notes.ts`, commit
> e `git push origin main`.

## Solução de problemas

- **Erro "JWT issued at future" (401) ao logar / enviar imagem** — o relógio do
  WSL/Docker desincronizou (comum depois que a máquina hiberna). Rode:
  ```bash
  npm run fix:clock
  ```
  Depois recarregue a página (`Ctrl+Shift+R`). (Se preferir, o equivalente manual
  é `wsl -d docker-desktop --exec date -s "@$(date -u +%s)"`, ou reiniciar o
  Docker Desktop.)

- **Edge responde 503 / "Exportar" ou "Gerar" falham** — o `functions serve`
  não está no ar. Rode `npm run edge` (ou `npm run dev`).

- **"Port 4200 is already in use"** — já há um `ng serve` rodando; use-o, ou
  encerre o processo antigo antes de subir outro.

- **Mudou uma migration em `supabase/migrations/`** — rode `npm run db:reset`
  para recriar o banco com o seed (apaga os dados locais de teste).

- **Recarregar depois de mudanças de estilo/tema** — às vezes o navegador
  guarda o bundle antigo; faça um *hard refresh* (`Ctrl+Shift+R`).

## Notas

- Projeto **local-only** por ora: sem GitHub, sem deploy. O git é local
  (branch `feat/mvp-starbottons`).
- O cadastro de usuários é manual (Studio/admin) — não há signup público.
