# Star Bottons

Aplicação web para **geração de arte de bottons** pronta para impressão. O
usuário faz upload de uma imagem, enquadra/edita, e o sistema gera a arte final
(PNG + PDF em **RGB 300 DPI**) respeitando sangria, área segura e diâmetro
visível por combinação **modelo × tamanho** de botton.

Stack: **Angular** (standalone components, TypeScript strict, SCSS) +
**Supabase** (Postgres, Auth, Storage, Edge Functions).

> Decisões de arquitetura estão em [`docs/adr/`](./docs/adr/) — leia antes de
> implementar features (processamento híbrido de imagem, formato de origem,
> `print_specs` parametrizados, RGB 300 DPI, geração síncrona com fallback).

## Como rodar

Pré-requisitos: Node 22+, npm 11+.

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Preencha o ambiente (**template skip-worktree**, ver abaixo). Edite
   `src/environments/environment.ts` com as credenciais do seu projeto Supabase:

   ```ts
   supabaseUrl: 'https://SEU_REF.supabase.co',
   supabaseAnonKey: 'SUA_ANON_KEY',
   ```

3. Suba o app em modo dev:

   ```bash
   ng serve
   # http://localhost:4200
   ```

### environment.ts é um TEMPLATE (skip-worktree)

O arquivo `src/environments/environment.ts` é versionado **apenas com
placeholders**. Cada dev preenche as credenciais localmente **sem commitar**.
Para o Git ignorar suas edições locais:

```bash
git update-index --skip-worktree src/environments/environment.ts
```

Para voltar a receber mudanças do template (ex.: um novo campo foi adicionado):

```bash
git update-index --no-skip-worktree src/environments/environment.ts
```

Ao **adicionar campos novos** ao environment, edite o template commitado (e o
tipo em `environment.type.ts`) e rode `tsc --noEmit`/`ng build` antes de
commitar — senão o build do CI quebra. Nunca faça commit de segredos.

## Scripts

| Comando         | O que faz                                     |
| --------------- | --------------------------------------------- |
| `npm start`     | Dev server (`ng serve`)                       |
| `npm run build` | Build de produção (`ng build`)                |
| `npm test`      | Testes unitários headless (Vitest)            |
| `npm run lint`  | ESLint (TS + templates + a11y + complexidade) |

## Estrutura de pastas

```
src/app/
  core/                 infraestrutura da aplicação
    auth/               AuthService + authGuard (Supabase Auth)
    supabase/           SupabaseClientService (cliente único)
    config/             APP_CONFIG (token do environment)
  features/             fluxos/telas (implementação futura)
    auth/  upload/  editor/  generation/  result/
  shared/               reutilizáveis, sem dependência de core/features
    ui/                 componentes de UI compartilhados
    utils/              mm-px.ts (mmToPx/mmToPt), etc.
    types/              contratos de tipo (ex.: PrintSpec ~ print_specs)
src/environments/       environment.ts (template) + tipo + produção
supabase/               config.toml, migrations/, functions/ (via CLI)
docs/adr/               Architecture Decision Records
```

Regras de camada (ver `.dependency-cruiser.js`): `features → core, shared`;
`core → shared`; `shared` não importa `core`/`features`; features não se
importam entre si; sem ciclos.

## Qualidade

Limiares em `quality-thresholds.json` (arquivo ≤ 400 linhas, função ≤ 40,
complexidade ciclomática ≤ 10, 1 classe por arquivo). Aplicados via ESLint.
Acessibilidade (WCAG 2.1 AA) validada pelas regras de template do angular-eslint.

## Supabase

`supabase/` contém `config.toml` e as pastas `migrations/` e `functions/`
(vazias no bootstrap). Migrations e Edge Functions são responsabilidade do
backend e aplicadas via **Supabase CLI** — por isso `supabase/**` está no
`paths-ignore` do CI.

## Documentação

- [Architecture Decision Records](./docs/adr/)
