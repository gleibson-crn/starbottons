-- Star Bottons — print_specs (ADR-003)
-- Catálogo paramétrico de geometria por combinação shape × tamanho.
-- Fonte única da verdade lida pelo Angular (preview) e pela Edge (arte final).
-- Fonte da verdade do tamanho físico da arte = art_diameter_mm.

create table if not exists public.print_specs (
  id               bigint generated always as identity primary key,
  shape            text        not null default 'round',
  visible_mm       numeric     not null,
  art_diameter_mm  numeric     not null,
  bleed_mm         numeric     not null,
  safe_mm          numeric     not null default 2,
  dpi_target       integer     not null default 300,
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),

  constraint print_specs_shape_visible_uniq unique (shape, visible_mm),

  -- bleed é DERIVADO, nunca constante: metade da diferença entre arte e visível.
  constraint print_specs_bleed_derivation_chk
    check (bleed_mm = (art_diameter_mm - visible_mm) / 2),

  -- a arte precisa ser maior que a área visível (há sangria).
  constraint print_specs_art_gt_visible_chk
    check (art_diameter_mm > visible_mm),

  -- deve sobrar área útil dentro da margem de segurança.
  constraint print_specs_positive_safe_area_chk
    check (visible_mm - 2 * safe_mm > 0),

  constraint print_specs_dpi_positive_chk check (dpi_target > 0)
);

comment on table public.print_specs is
  'Geometria paramétrica por shape×tamanho (ADR-003). art_diameter_mm = fonte da verdade do tamanho físico.';

-- Seed dos 3 tamanhos do MVP (só formato redondo).
-- bleed derivado: (44-32)/2=6, (54-44)/2=5, (70-58)/2=6.
insert into public.print_specs
  (shape, visible_mm, art_diameter_mm, bleed_mm, safe_mm, dpi_target)
values
  ('round', 32, 44, 6, 2, 300),
  ('round', 44, 54, 5, 2, 300),
  ('round', 58, 70, 6, 2, 300)
on conflict (shape, visible_mm) do nothing;
