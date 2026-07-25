-- Star Bottons — generation_jobs (ADR-005)
-- Rastreia cada pedido de geração de arte. Suporta o fallback assíncrono:
-- caso síncrono termina em 'done'; se estourar o orçamento de tempo, fica
-- 'processing' e o client faz polling nesta tabela.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'job_status') then
    create type public.job_status as enum ('queued', 'processing', 'done', 'error');
  end if;
end
$$;

create table if not exists public.generation_jobs (
  id            uuid              primary key default gen_random_uuid(),
  upload_id     uuid              not null references public.uploads (id) on delete cascade,
  shape         text              not null default 'round',
  size_mm       numeric           not null,  -- = visible_mm da print_spec escolhida
  status        public.job_status not null default 'queued',
  params        jsonb             not null default '{}'::jsonb,
  error_message text,
  -- nullable: FK on delete set null preserva o job se o usuário for removido.
  requested_by  uuid              default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz       not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

comment on table public.generation_jobs is
  'Jobs de geração de arte (ADR-005). size_mm = visible_mm; status suporta polling do fallback assíncrono.';

create index if not exists generation_jobs_status_idx    on public.generation_jobs (status);
create index if not exists generation_jobs_upload_id_idx on public.generation_jobs (upload_id);
