/**
 * Contrato do catálogo de fallback client-side vs. a fonte da verdade do
 * backend (migration `print_specs` seed / matriz GOLDEN de aceite).
 *
 * O catálogo em print-spec-catalog.ts é usado quando a consulta ao Postgres
 * falha (e, hoje, SEMPRE — ver print-spec.service.spec.ts, que consulta uma
 * coluna inexistente). Portanto estes valores caem direto na arte final:
 * `art_diameter_mm` alimenta pxPerMm em buildGenerateRequest, que posiciona a
 * imagem. Se divergirem do backend, o botton impresso sai deslocado.
 *
 * ⚠️ Espera-se que 44 mm FALHE: o catálogo traz artDiameterMm=56/bleed=6, mas a
 * migration (e a Edge) usam 54/5. Defeito a corrigir no código de produção.
 */
import { fallbackSpec } from './print-spec-catalog';

interface SeedRow {
  readonly sizeMm: number;
  readonly artDiameterMm: number;
  readonly bleedMm: number;
}

// Seed real da migration 20260724120000_print_specs.sql (fonte da verdade).
const MIGRATION_SEED: readonly SeedRow[] = [
  { sizeMm: 32, artDiameterMm: 44, bleedMm: 6 },
  { sizeMm: 44, artDiameterMm: 54, bleedMm: 5 },
  { sizeMm: 58, artDiameterMm: 70, bleedMm: 6 },
];

describe('fallbackSpec — paridade com o seed do backend', () => {
  it.each(MIGRATION_SEED)(
    'art_diameter_mm de $sizeMm mm bate com a migration ($artDiameterMm)',
    ({ sizeMm, artDiameterMm }) => {
      const spec = fallbackSpec('round', sizeMm);

      expect(spec?.artDiameterMm).toBe(artDiameterMm);
    },
  );

  it.each(MIGRATION_SEED)(
    'bleed_mm de $sizeMm mm bate com a migration ($bleedMm)',
    ({ sizeMm, bleedMm }) => {
      const spec = fallbackSpec('round', sizeMm);

      expect(spec?.bleedMm).toBe(bleedMm);
    },
  );

  it.each(MIGRATION_SEED)(
    'sangria é derivada: (art − face)/2 para $sizeMm mm',
    ({ sizeMm }) => {
      const spec = fallbackSpec('round', sizeMm);
      const derived = ((spec?.artDiameterMm ?? 0) - (spec?.visibleMm ?? 0)) / 2;

      expect(spec?.bleedMm).toBe(derived);
    },
  );

  it('retorna null para modelo não-redondo (só round no MVP)', () => {
    expect(fallbackSpec('square', 44)).toBeNull();
  });

  it('retorna null para tamanho fora do catálogo', () => {
    expect(fallbackSpec('round', 99)).toBeNull();
  });
});
