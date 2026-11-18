-- Star Bottons — REMOÇÃO da feature "presets de moldura" (rejeitada pelo dono).
-- Derruba as tabelas criadas em 20261016120000 + CHECKs de 20261016130000.
-- Forward migration (não `db reset`): preserva as molduras já cadastradas em
-- `frame_templates` e os uploads no bucket. A ordem importa (layers primeiro, por
-- causa da FK). `drop table` já remove policies, índices e grants.

drop table if exists public.frame_preset_layers;
drop table if exists public.frame_presets;
