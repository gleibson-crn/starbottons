-- Moldura composta por CAMADAS: cada moldura (frame_templates) passa a ter N camadas
-- persistidas aqui + um PNG ACHATADO (render da composição) em
-- frame_templates.storage_path (o que o pipeline/Edge já consome — Edge NÃO muda).
-- Enquadramento NORMALIZADO por camada (offset = fração do lado da composição).
-- Backward-compatible: tabela nova + coluna com default.

create table if not exists public.frame_template_layers (
  id               uuid     primary key default gen_random_uuid(),
  template_id      uuid     not null references public.frame_templates (id) on delete cascade,
  position         smallint not null,
  storage_path     text     not null,
  offset_x         real     not null default 0,
  offset_y         real     not null default 0,
  scale            real     not null default 1,
  rotation         real     not null default 0,
  source           text     not null default 'upload',
  origin_template_id uuid,
  constraint frame_template_layers_source_chk   check (source in ('upload', 'template')),
  constraint frame_template_layers_scale_chk    check (scale between 0.2 and 8),
  constraint frame_template_layers_rotation_chk check (rotation between -180 and 180),
  constraint frame_template_layers_offset_chk   check (offset_x between -2 and 2 and offset_y between -2 and 2),
  constraint frame_template_layers_position_uq  unique (template_id, position)
);

comment on table public.frame_template_layers is
  'Camadas (PNGs com enquadramento normalizado) de uma moldura composta. O PNG achatado vive em frame_templates.storage_path.';
comment on column public.frame_template_layers.offset_x is
  'Deslocamento X da camada: fração do lado da composição.';
comment on column public.frame_template_layers.offset_y is
  'Deslocamento Y da camada: fração do lado da composição.';

create index if not exists frame_template_layers_template_id_idx
  on public.frame_template_layers (template_id);

alter table public.frame_templates
  add column if not exists is_composite boolean not null default false;

alter table public.frame_template_layers enable row level security;

drop policy if exists frame_template_layers_all on public.frame_template_layers;
create policy frame_template_layers_all
  on public.frame_template_layers
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.frame_template_layers to authenticated, service_role;

-- BACKFILL: cada moldura existente vira 1 camada neutra (= seu PNG atual).
insert into public.frame_template_layers (template_id, position, storage_path, source)
select id, 0, storage_path, 'upload'
from public.frame_templates
where not exists (
  select 1 from public.frame_template_layers l where l.template_id = frame_templates.id
);
