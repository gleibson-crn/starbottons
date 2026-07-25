-- Star Bottons — RLS single-tenant
-- Ferramenta interna single-tenant: qualquer usuário autenticado opera sobre os
-- dados operacionais. Ainda assim, TODA policy de escrita traz WITH CHECK explícito
-- (lição do outro projeto do dono: policies sem WITH CHECK permitem escrita indevida).

-- ── Catálogo: print_specs (somente leitura para autenticados) ───────────────
alter table public.print_specs enable row level security;

drop policy if exists print_specs_select on public.print_specs;
create policy print_specs_select
  on public.print_specs
  for select
  to authenticated
  using (true);

-- ── Operacionais: uploads / generation_jobs / assets ────────────────────────
alter table public.uploads          enable row level security;
alter table public.generation_jobs  enable row level security;
alter table public.assets           enable row level security;

drop policy if exists uploads_all on public.uploads;
create policy uploads_all
  on public.uploads
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists generation_jobs_all on public.generation_jobs;
create policy generation_jobs_all
  on public.generation_jobs
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists assets_all on public.assets;
create policy assets_all
  on public.assets
  for all
  to authenticated
  using (true)
  with check (true);
