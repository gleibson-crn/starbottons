-- Star Bottons — CHECKs de defesa em profundidade para os presets de moldura
-- (security review F-001/F-002, severidade low). O app (snapshot/save) e a Edge
-- (`generate-art/http.ts`: clamp ≤3, scale [0.1,10], offset ±500) já saneiam; estes
-- CHECKs apenas espelham esses invariantes NO BANCO para fechar a última camada.
-- Aditivo (ALTER): não precisa de `db reset`, preserva os dados locais existentes.

alter table public.frame_presets
  add constraint frame_presets_name_len_chk
    check (char_length(name) between 1 and 80),
  add constraint frame_presets_thumb_path_chk
    check (thumb_path ~ '^frame-presets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$');

alter table public.frame_preset_layers
  add constraint frame_preset_layers_position_chk
    check (position between 0 and 2),            -- teto de 3 camadas (z-order 0..2)
  add constraint frame_preset_layers_scale_chk
    check (scale between 0.1 and 10),             -- mesmo intervalo do clampScale da Edge
  add constraint frame_preset_layers_offset_x_chk
    check (abs(offset_x) <= 500),                 -- mesmo teto do clampOffsetMm da Edge
  add constraint frame_preset_layers_offset_y_chk
    check (abs(offset_y) <= 500);
