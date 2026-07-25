-- Star Bottons — batch_id: agrupa jobs de um mesmo lote (ADR-007).
-- Nullable => fluxo single (1 imagem) permanece com batch_id NULL (retrocompatível).
-- Carimbado pelo PRE-INSERT do client (status queued + batch_id) antes de invocar a
-- Edge generate-art; o UPSERT por id da Edge preserva batch_id (não mexe na Edge).
alter table public.generation_jobs
  add column if not exists batch_id uuid;

create index if not exists generation_jobs_batch_id_idx
  on public.generation_jobs (batch_id) where batch_id is not null;

-- RLS/GRANTs: NADA a alterar.
-- • A policy generation_jobs_all (20260724120400_rls.sql) é `for all ... using (true)
--   with check (true)` — avaliação a NÍVEL DE LINHA, independente de colunas. A nova
--   coluna batch_id já é coberta por ela (leitura e escrita permitidas).
-- • Os GRANTs (20260724120600_grants.sql) são select/insert/update/delete a NÍVEL DE
--   TABELA (sem lista de colunas) para authenticated e service_role. Grants de tabela
--   abrangem automaticamente colunas adicionadas depois. Nenhum re-grant é necessário.
comment on column public.generation_jobs.batch_id is
  'Agrupa jobs de um mesmo lote (ADR-007). NULL = fluxo single (1 imagem). Coberto pela RLS generation_jobs_all e pelos GRANTs de tabela existentes.';
