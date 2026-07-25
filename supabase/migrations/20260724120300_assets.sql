-- Star Bottons — assets
-- Artefatos gerados por um job (arte de impressão PNG/PDF, mockup, preview).
-- Binários no bucket privado `renders`; acesso só por signed URL.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'asset_kind') then
    create type public.asset_kind as enum ('print_pdf', 'print_png', 'mockup_png', 'preview_webp');
  end if;
end
$$;

create table if not exists public.assets (
  id           uuid              primary key default gen_random_uuid(),
  job_id       uuid              not null references public.generation_jobs (id) on delete cascade,
  kind         public.asset_kind not null,
  storage_path text              not null,
  mime         text              not null,
  bytes        bigint,
  width_px     integer,
  height_px    integer,
  dpi          integer,
  created_at   timestamptz       not null default now()
);

comment on table public.assets is
  'Artefatos gerados por job. Binários no bucket privado renders (download só por signed URL).';

create index if not exists assets_job_id_idx on public.assets (job_id);
