/**
 * Contrato de leitura de `print_specs` (front → Postgres).
 *
 * Verifica que o serviço filtra apenas por COLUNAS QUE EXISTEM na tabela
 * `print_specs` (migration 20260724120000). A Edge (db.ts::fetchSpec) filtra
 * corretamente por `visible_mm`.
 *
 * ⚠️ Espera-se FALHA: o serviço consulta `.eq('size_mm', ...)`, e `size_mm` não
 * existe em print_specs (a coluna é `visible_mm`). Em produção isso faz o
 * PostgREST devolver erro → o serviço cai SEMPRE no catálogo de fallback,
 * mascarando o defeito e propagando os valores errados de 44 mm. Corrigir no
 * código de produção (não em teste).
 */
import { TestBed } from '@angular/core/testing';
import { SupabaseClientService } from '../../core/supabase';
import { PrintSpecService } from './print-spec.service';

// Colunas reais de public.print_specs (migration 20260724120000_print_specs.sql).
const PRINT_SPECS_COLUMNS = new Set([
  'id',
  'shape',
  'visible_mm',
  'art_diameter_mm',
  'bleed_mm',
  'safe_mm',
  'dpi_target',
  'is_active',
  'created_at',
]);

/** Query builder falso encadeável que grava as colunas filtradas via `.eq`. */
function fakeClient(maybeSingle: () => Promise<unknown>): {
  client: unknown;
  eqColumns: string[];
} {
  const eqColumns: string[] = [];
  const builder: Record<string, unknown> = {};
  builder['select'] = (): unknown => builder;
  builder['eq'] = (column: string): unknown => {
    eqColumns.push(column);
    return builder;
  };
  builder['maybeSingle'] = maybeSingle;
  const client = { from: (): unknown => builder };
  return { client, eqColumns };
}

function setup(fake: { client: unknown }): PrintSpecService {
  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseClientService, useValue: fake }],
  });
  return TestBed.inject(PrintSpecService);
}

describe('PrintSpecService — contrato de colunas', () => {
  it('filtra somente por colunas existentes em print_specs', async () => {
    const fake = fakeClient(() =>
      Promise.resolve({ data: { visible_mm: 44, art_diameter_mm: 54, bleed_mm: 5 } }),
    );
    const service = setup(fake);

    await service.load('round', 44);

    const unknownColumns = fake.eqColumns.filter((c) => !PRINT_SPECS_COLUMNS.has(c));
    expect(unknownColumns).toEqual([]);
  });

  it('cai no catálogo de fallback quando a consulta falha (resiliência)', async () => {
    const fake = fakeClient(() => Promise.reject(new Error('coluna inexistente')));
    const service = setup(fake);

    const spec = await service.load('round', 32);

    expect(spec.sizeMm).toBe(32);
    expect(spec.artDiameterMm).toBe(44);
  });

  it('lança quando não há spec nem fallback para o tamanho', async () => {
    const fake = fakeClient(() => Promise.resolve({ data: null }));
    const service = setup(fake);

    await expect(service.load('round', 99)).rejects.toThrow('Sem print_spec');
  });
});
