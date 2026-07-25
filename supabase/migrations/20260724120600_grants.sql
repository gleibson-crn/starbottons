-- Star Bottons — GRANTs de privilégio de tabela
--
-- No PostgreSQL, RLS e GRANT são camadas independentes: a policy RLS controla
-- QUAIS linhas a role enxerga, mas o GRANT controla se a OPERAÇÃO (select/insert/
-- update/delete) é permitida no nível da tabela. Sem estes grants, o PostgREST
-- (que autentica como a role `authenticated`) e a Edge Function (que usa a role
-- `service_role`) recebem "permission denied for table ..." mesmo com as policies
-- de 20260724120400_rls.sql sendo permissivas.
--
-- Single-tenant: nada é concedido a `anon` — toda operação exige usuário autenticado.

-- ── Catálogo: print_specs (somente leitura pelo app; seed vem da migration) ──
grant select on public.print_specs to authenticated, service_role;

-- ── Operacionais: authenticated opera pelo app; service_role é usado pela Edge ─
grant select, insert, update, delete on public.uploads         to authenticated, service_role;
grant select, insert, update, delete on public.generation_jobs to authenticated, service_role;
grant select, insert, update, delete on public.assets          to authenticated, service_role;
