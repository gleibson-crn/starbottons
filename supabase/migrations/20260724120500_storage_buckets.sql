-- Star Bottons — Storage buckets (privados) + policies
-- `uploads`  → imagens de origem enviadas pelo usuário.
-- `renders`  → artefatos gerados (arte PNG/PDF, mockup, preview).
-- Ambos privados: download só por signed URL. Policies espelham a RLS single-tenant.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('uploads', 'uploads', false, 26214400, array['image/png', 'image/jpeg']),
  ('renders', 'renders', false, 52428800, array['image/png', 'application/pdf', 'image/webp'])
on conflict (id) do nothing;

-- Policies em storage.objects, escopadas por bucket_id, para authenticated.
-- A Edge Function usa service_role (bypassa RLS) para gravar em renders.

drop policy if exists sb_uploads_all on storage.objects;
create policy sb_uploads_all
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'uploads')
  with check (bucket_id = 'uploads');

drop policy if exists sb_renders_all on storage.objects;
create policy sb_renders_all
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'renders')
  with check (bucket_id = 'renders');
