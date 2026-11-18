-- Star Bottons — frame_presets (presets de moldura: pilha de até 3 molduras)
-- Um preset salva uma pilha de molduras sobrepostas (cada camada referencia um
-- frame_templates + gestos offset/scale/rotation) para reuso. O thumb (PNG da
-- composição) fica no bucket EXISTENTE `uploads` (frame-presets/{uuid}.png).
--
-- A FK layer→template é ON DELETE RESTRICT: não se exclui uma moldura em uso por
-- preset (o app traduz o erro numa mensagem amigável via presetsUsingTemplate).
--
-- Padrão single-tenant do projeto (espelha frame_templates):
--   • RLS (LINHA): policy `for all to authenticated using(true) with check(true)`.
--   • GRANT (TABELA): select/insert/update/delete a authenticated + service_role.

create table if not exists public.frame_presets (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  thumb_path    text        not null,
  requested_by  uuid        references auth.users (id),
  created_at    timestamptz not null default now()
);

comment on table public.frame_presets is
  'Presets de moldura: pilha (1..3) de camadas de frame_templates com gestos próprios. Thumb no bucket uploads.';

create table if not exists public.frame_preset_layers (
  id           uuid  primary key default gen_random_uuid(),
  preset_id    uuid  not null references public.frame_presets (id) on delete cascade,
  template_id  uuid  not null references public.frame_templates (id) on delete restrict,
  position     int   not null,
  offset_x     real  not null default 0,
  offset_y     real  not null default 0,
  scale        real  not null default 1,
  rotation     real  not null default 0,
  unique (preset_id, position)
);

comment on table public.frame_preset_layers is
  'Camadas de um preset de moldura (position = z-order). template_id RESTRICT: moldura em uso não pode ser excluída.';

create index if not exists frame_preset_layers_preset_id_idx
  on public.frame_preset_layers (preset_id);
create index if not exists frame_preset_layers_template_id_idx
  on public.frame_preset_layers (template_id);

-- ── RLS (nível de LINHA) ────────────────────────────────────────────────────
alter table public.frame_presets enable row level security;
alter table public.frame_preset_layers enable row level security;

drop policy if exists frame_presets_all on public.frame_presets;
create policy frame_presets_all
  on public.frame_presets
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists frame_preset_layers_all on public.frame_preset_layers;
create policy frame_preset_layers_all
  on public.frame_preset_layers
  for all
  to authenticated
  using (true)
  with check (true);

-- ── GRANT (nível de TABELA) ─────────────────────────────────────────────────
grant select, insert, update, delete on public.frame_presets to authenticated, service_role;
grant select, insert, update, delete on public.frame_preset_layers to authenticated, service_role;
