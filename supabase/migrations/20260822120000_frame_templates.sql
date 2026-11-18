-- Star Bottons — frame_templates (Moldura do botton — espelho de background_templates)
-- Biblioteca de MOLDURAS pré-cadastradas: PNGs decorativos com transparência que
-- o usuário aplica SOBRE a arte (camada de topo). Espelho exato de
-- background_templates, com UMA diferença: a moldura precisa do canal ALFA, então
-- o `mime` é restrito a `image/png` apenas (JPEG não tem transparência e taparia
-- o botton inteiro). Apenas metadados: o binário fica no bucket EXISTENTE `uploads`.
--
-- Por que reutilizar `uploads` (igual ao fundo):
-- a moldura É COMPOSTA NA IMPRESSÃO (vai ao Deno/gráfica pela Edge generate-art,
-- que baixa via `downloadSource` fixo no bucket `uploads`). Ficar em `uploads`
-- deixa o path utilizável pela Edge SEM alterar o contrato
-- (`options.frameImage` = path no bucket uploads).
--
-- Padrão single-tenant do projeto (espelha background_templates / mockup_templates):
--   • RLS (LINHA): policy `for all to authenticated using(true) with check(true)`.
--   • GRANT (TABELA): select/insert/update/delete a authenticated + service_role
--     (RLS e GRANT são camadas independentes — sem o GRANT dá "permission denied").

create table if not exists public.frame_templates (
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

  -- Só PNG: a moldura precisa de alfa (transparência no miolo p/ a arte aparecer).
  constraint frame_templates_mime_chk
    check (mime = 'image/png'),
  constraint frame_templates_bytes_positive_chk
    check (bytes is null or bytes >= 0)
);

comment on table public.frame_templates is
  'Biblioteca de molduras do botton (espelho de background_templates). Binário no bucket uploads (PNG apenas — precisa de alfa; composta como camada de TOPO na impressão pela Edge).';

create index if not exists frame_templates_created_at_idx
  on public.frame_templates (created_at desc);

-- ── RLS (nível de LINHA) — padrão single-tenant do projeto ──────────────────
alter table public.frame_templates enable row level security;

drop policy if exists frame_templates_all on public.frame_templates;
create policy frame_templates_all
  on public.frame_templates
  for all
  to authenticated
  using (true)
  with check (true);

-- ── GRANT (nível de TABELA) — camada independente da RLS ────────────────────
grant select, insert, update, delete on public.frame_templates to authenticated, service_role;
