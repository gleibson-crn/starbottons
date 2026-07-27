# Rodando o Star Bottons localmente

Guia para subir o projeto **100% na sua máquina** (sem nuvem, sem GitHub).
O app é Angular + Supabase local (via Docker).

## Pré-requisitos (instalar uma vez)

- **Docker Desktop** (rodando) — o Supabase local sobe em containers.
- **Node.js** (18+; testado com 24) e **npm**.
- **Supabase CLI** (`supabase --version`).
- Dependências do projeto: na raiz, rode `npm install`.

## Primeira vez (setup)

```bash
npm install                 # dependências do app
npm run db:start            # sobe o Supabase local (baixa imagens Docker na 1a vez — demora)
npm run db:reset            # aplica as migrations + seed (cria tabelas, buckets, print_specs)
```

O `environment.ts` (em `src/environments/`) já está preenchido com as credenciais
do Supabase local — que são **fixas/padrão do Supabase CLI**, então valem sempre
que o `db:start` sobe. Ele é `skip-worktree` (suas edições locais não entram no git).
Se algum dia precisar reeditar: `git update-index --no-skip-worktree src/environments/environment.ts`.

### Criar um usuário para entrar

O cadastro público é **desligado** (ferramenta interna). Crie usuários assim:

- **Pelo Supabase Studio** (mais fácil): abra `http://127.0.0.1:54323` →
  *Authentication* → *Users* → *Add user* → marque **Auto Confirm User**.
- Já existe um de teste: **teste@starbottons.local** / **teste123456**.

## Dia a dia (rodar o app)

Com o Docker aberto:

```bash
npm run db:start   # se o Supabase ainda não estiver de pé (idempotente)
npm run dev        # sobe a Edge Function + o app juntos (um comando)
```

Depois abra **http://localhost:4200**.

> `npm run dev` roda, em paralelo, o `supabase functions serve generate-art`
> (gera a arte de impressão) e o `ng serve` (o app). Encerre com `Ctrl+C`.

Se preferir separado (2 terminais):

```bash
npm run edge       # Edge Function generate-art  (http://127.0.0.1:54321/functions/v1)
npm start          # app Angular                 (http://localhost:4200)
```

## Endereços úteis

| O quê | URL |
|---|---|
| App | http://localhost:4200 |
| Supabase Studio (banco, storage, usuários) | http://127.0.0.1:54323 |
| API / Storage / Auth | http://127.0.0.1:54321 |

## Parar tudo

```bash
# Ctrl+C encerra o `npm run dev` (Edge + app)
npm run db:stop     # para os containers do Supabase (os dados ficam salvos)
```

## Solução de problemas

- **Erro "JWT issued at future" (401) ao logar / enviar imagem** — o relógio do
  WSL/Docker desincronizou (comum depois que a máquina hiberna). Ressincronize:
  ```bash
  wsl -d docker-desktop --exec date -s "@$(date -u +%s)"
  ```
  (ou reinicie o Docker Desktop). Depois recarregue a página.

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
