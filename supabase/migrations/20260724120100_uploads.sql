-- Star Bottons — uploads
-- Metadados das imagens de origem (PNG/JPEG apenas — ADR-002; nunca WebP na origem).
-- O binário vive no bucket privado `uploads`; aqui ficam os metadados.

create table if not exists public.uploads (
  id           uuid        primary key default gen_random_uuid(),
  storage_path text        not null,
  -- nullable: FK on delete set null preserva o upload se o usuário for removido.
  user_id      uuid        default auth.uid() references auth.users (id) on delete set null,
  filename     text        not null,
  mime         text        not null,
  width_px     integer,
  height_px    integer,
  bytes        bigint,
  created_at   timestamptz not null default now(),

  -- Origem restrita a PNG/JPEG (ADR-002).
  constraint uploads_mime_chk check (mime in ('image/png', 'image/jpeg')),
  constraint uploads_dimensions_positive_chk
    check ((width_px is null or width_px > 0) and (height_px is null or height_px > 0)),
  constraint uploads_bytes_positive_chk check (bytes is null or bytes >= 0)
);

comment on table public.uploads is
  'Metadados das imagens de origem (ADR-002: PNG/JPEG). Binário no bucket privado uploads.';

create index if not exists uploads_user_id_idx on public.uploads (user_id);
