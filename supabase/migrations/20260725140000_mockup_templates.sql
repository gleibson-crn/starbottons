-- Star Bottons — mockup_templates (Mockup Contextual)
-- Biblioteca de cenas (backdrops) para o mockup contextual: bucket privado + tabela
-- de metadados. Cada cena traz uma geometria-alvo normalizada (onde o botão é
-- composto sobre a cena) e as dimensões da cena.
--
-- Padrão single-tenant do projeto (mesmo de rls.sql / grants.sql / storage_buckets.sql):
--   • RLS (nível de LINHA): policy `for all to authenticated using(true) with check(true)`
--     — qualquer autenticado opera; WITH CHECK explícito por disciplina do projeto.
--   • GRANT (nível de TABELA): select/insert/update/delete a authenticated + service_role.
--     RLS e GRANT são camadas independentes: sem o GRANT, o PostgREST (role
--     `authenticated`) e a Edge Function (role `service_role`) tomam
--     "permission denied for table" mesmo com a policy permissiva.
--
-- WebP PERMITIDO neste bucket (diferente de uploads/ADR-002): a cena é apenas um
-- backdrop composto no Canvas do browser, NUNCA vai ao Deno/gráfica — ADR-002 (que
-- proíbe WebP na origem que segue para impressão) não se aplica aqui. A cena entra
-- já reduzida (limite de 10 MB).

-- ── Bucket privado da biblioteca de cenas ──────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mockup_templates', 'mockup_templates', false, 10485760,
        array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Policy em storage.objects escopada por bucket_id, para authenticated
-- (espelha sb_uploads_all / sb_renders_all).
drop policy if exists sb_mockup_templates_all on storage.objects;
create policy sb_mockup_templates_all
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'mockup_templates')
  with check (bucket_id = 'mockup_templates');

-- ── Metadados das cenas ─────────────────────────────────────────────────────
create table if not exists public.mockup_templates (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  storage_path    text        not null,
  mime            text        not null,
  bytes           bigint,
  scene_width_px  integer,
  scene_height_px integer,
  -- geometria-alvo normalizada {cx, cy, r, rotation} — onde o botão é composto.
  target          jsonb       not null,
  -- nullable: FK on delete set null preserva a cena se o usuário for removido.
  requested_by    uuid        default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint mockup_templates_mime_chk
    check (mime in ('image/webp', 'image/jpeg', 'image/png')),
  constraint mockup_templates_bytes_positive_chk
    check (bytes is null or bytes >= 0),
  -- garante o shape mínimo da geometria-alvo (cx/cy/r são numéricos).
  constraint mockup_templates_target_shape_chk check (
    jsonb_typeof(target->'cx') = 'number' and
    jsonb_typeof(target->'cy') = 'number' and
    jsonb_typeof(target->'r')  = 'number'
  )
);

comment on table public.mockup_templates is
  'Biblioteca de cenas (backdrops) do mockup contextual. Binário no bucket privado mockup_templates; WebP permitido (backdrop de Canvas, não vai à gráfica — ADR-002 não se aplica).';

create index if not exists mockup_templates_created_at_idx
  on public.mockup_templates (created_at desc);

-- ── RLS (nível de LINHA) — padrão single-tenant do projeto ──────────────────
alter table public.mockup_templates enable row level security;

drop policy if exists mockup_templates_all on public.mockup_templates;
create policy mockup_templates_all
  on public.mockup_templates
  for all
  to authenticated
  using (true)
  with check (true);

-- ── GRANT (nível de TABELA) — camada independente da RLS ────────────────────
grant select, insert, update, delete on public.mockup_templates to authenticated, service_role;
