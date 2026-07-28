-- Star Bottons — background_templates (Fundo do botton, ADR-016 / Estágio 2b)
-- Biblioteca de IMAGENS de fundo pré-cadastradas (fotos/cenas) que o usuário pode
-- escolher como fundo do botton na aba "Fundo". Apenas metadados: o binário fica
-- no bucket EXISTENTE `uploads` (mesmo da arte de origem).
--
-- Por que reutilizar `uploads` (e não um bucket próprio como mockup_templates):
-- a imagem de fundo É COMPOSTA NA IMPRESSÃO (vai ao Deno/gráfica pela Edge
-- generate-art, que baixa via `downloadSource` fixo no bucket `uploads`). Logo:
--   • precisa ser PNG/JPEG (ADR-002 proíbe WebP na origem que segue para impressão) —
--     ao contrário de mockup_templates, cujo backdrop só vive no Canvas do browser;
--   • ficar em `uploads` deixa o path utilizável pela Edge SEM alterar o contrato
--     (`options.backgroundImage` = path no bucket uploads).
--
-- Padrão single-tenant do projeto (espelha mockup_templates / rls.sql / grants.sql):
--   • RLS (LINHA): policy `for all to authenticated using(true) with check(true)`.
--   • GRANT (TABELA): select/insert/update/delete a authenticated + service_role
--     (RLS e GRANT são camadas independentes — sem o GRANT dá "permission denied").

create table if not exists public.background_templates (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  -- caminho do objeto NO BUCKET `uploads` (reutilizado pela Edge na composição).
  storage_path  text        not null,
  mime          text        not null,
  bytes         bigint,
  width_px      integer,
  height_px     integer,
  -- nullable: FK on delete set null preserva o template se o usuário for removido.
  requested_by  uuid        default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint background_templates_mime_chk
    check (mime in ('image/png', 'image/jpeg')),
  constraint background_templates_bytes_positive_chk
    check (bytes is null or bytes >= 0)
);

comment on table public.background_templates is
  'Biblioteca de imagens de fundo do botton (ADR-016). Binário no bucket uploads (PNG/JPEG, pois a imagem é composta na impressão pela Edge — ADR-002 se aplica).';

create index if not exists background_templates_created_at_idx
  on public.background_templates (created_at desc);

-- ── RLS (nível de LINHA) — padrão single-tenant do projeto ──────────────────
alter table public.background_templates enable row level security;

drop policy if exists background_templates_all on public.background_templates;
create policy background_templates_all
  on public.background_templates
  for all
  to authenticated
  using (true)
  with check (true);

-- ── GRANT (nível de TABELA) — camada independente da RLS ────────────────────
grant select, insert, update, delete on public.background_templates to authenticated, service_role;
