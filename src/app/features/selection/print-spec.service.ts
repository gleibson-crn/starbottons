import { inject, Injectable } from '@angular/core';
import { SupabaseClientService } from '../../core/supabase';
import type { PrintSpec } from '../../shared/types';
import { DEFAULT_DPI, fallbackSpec } from '../../shared/utils';

interface PrintSpecRow {
  shape?: string;
  size_mm?: number;
  visible_mm?: number;
  art_diameter_mm?: number;
  bleed_mm?: number;
  safe_mm?: number;
  dpi_target?: number;
}

/**
 * PrintSpecService — carrega a `print_spec` de `print_specs` (Postgres,
 * colunas `shape/visible_mm/art_diameter_mm/bleed_mm/safe_mm/dpi_target`,
 * filtrando `is_active`). Em erro/ausência usa o catálogo de fallback,
 * mantendo o editor operacional sem inventar valores.
 */
@Injectable({ providedIn: 'root' })
export class PrintSpecService {
  private readonly supabase = inject(SupabaseClientService).client;

  async load(model: string, sizeMm: number): Promise<PrintSpec> {
    try {
      const row = await this.query(model, sizeMm);
      return row ? this.mapRow(row, model, sizeMm) : this.orFallback(model, sizeMm);
    } catch {
      return this.orFallback(model, sizeMm);
    }
  }

  private async query(
    model: string,
    sizeMm: number,
  ): Promise<PrintSpecRow | null> {
    const { data } = await this.supabase
      .from('print_specs')
      .select('*')
      .eq('shape', model)
      .eq('visible_mm', sizeMm)
      .eq('is_active', true)
      .maybeSingle();
    return (data as PrintSpecRow | null) ?? null;
  }

  private mapRow(row: PrintSpecRow, model: string, sizeMm: number): PrintSpec {
    const fb = this.orFallback(model, sizeMm);
    return {
      model,
      sizeMm,
      visibleMm: row.visible_mm ?? fb.visibleMm,
      artDiameterMm: row.art_diameter_mm ?? fb.artDiameterMm,
      bleedMm: row.bleed_mm ?? fb.bleedMm,
      safeMm: row.safe_mm ?? fb.safeMm,
      dpiTarget: row.dpi_target ?? DEFAULT_DPI,
    };
  }

  private orFallback(model: string, sizeMm: number): PrintSpec {
    const spec = fallbackSpec(model, sizeMm);
    if (!spec) {
      throw new Error(`Sem print_spec para ${model} ${sizeMm}mm.`);
    }
    return spec;
  }
}
