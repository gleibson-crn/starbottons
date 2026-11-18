-- Enquadramento PADRÃO por moldura (offset/scale/rotation) aplicado quando a
-- moldura é usada num botton. Offset NORMALIZADO (fração do lado do editor).
-- Backward-compatible: colunas com default neutro; policies/grants existentes
-- (incl. UPDATE) já cobrem.
alter table public.frame_templates
  add column if not exists default_offset_x real not null default 0,
  add column if not exists default_offset_y real not null default 0,
  add column if not exists default_scale    real not null default 1,
  add column if not exists default_rotation real not null default 0;

-- Limites espelham SCALE_MIN/SCALE_MAX de shared/ui/canvas-editor/editor-transform.ts.
alter table public.frame_templates
  add constraint frame_templates_default_scale_chk    check (default_scale between 0.2 and 8),
  add constraint frame_templates_default_rotation_chk check (default_rotation between -180 and 180),
  add constraint frame_templates_default_offset_chk   check (default_offset_x between -2 and 2 and default_offset_y between -2 and 2);

comment on column public.frame_templates.default_offset_x is
  'Deslocamento X padrão da moldura: FRAÇÃO do lado do editor (não px, não mm).';
comment on column public.frame_templates.default_offset_y is
  'Deslocamento Y padrão da moldura: FRAÇÃO do lado do editor (não px, não mm).';
