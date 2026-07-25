/**
 * GOLDEN / caracterização dimensional (frontend).
 *
 * Ancora os VALORES ABSOLUTOS da matriz de impressão @300 DPI para os 3
 * tamanhos do MVP, do lado do Angular (mm-px.ts). O lado do backend
 * (geometry.ts) tem um golden espelhado em geometry.golden.test.ts — os dois
 * DEVEM produzir os mesmos números (matemática compartilhada, ADR-001/003).
 *
 * Matriz esperada (art_diameter_mm = fonte da verdade):
 *   face_mm | art_mm | face@300 | art@300 | bleed@300/lado
 *      32   |   44   |   378    |   520   |     71
 *      44   |   54   |   520    |   638   |     59
 *      58   |   70   |   685    |   827   |     71
 * Invariante: face@300 + 2*bleed@300 == art@300 (±1). Todos art@300 < 900.
 */
import { mmToPx } from './mm-px';

interface GoldenRow {
  readonly faceMm: number;
  readonly artMm: number;
  readonly bleedMm: number;
  readonly facePx: number;
  readonly artPx: number;
  readonly bleedPx: number;
}

// Números fixados a partir do enunciado de aceite (não recalculados a partir
// das fórmulas — é justamente o que queremos travar).
const GOLDEN: readonly GoldenRow[] = [
  { faceMm: 32, artMm: 44, bleedMm: 6, facePx: 378, artPx: 520, bleedPx: 71 },
  { faceMm: 44, artMm: 54, bleedMm: 5, facePx: 520, artPx: 638, bleedPx: 59 },
  { faceMm: 58, artMm: 70, bleedMm: 6, facePx: 685, artPx: 827, bleedPx: 71 },
];

describe('GOLDEN matriz de impressão @300 DPI (frontend mm-px)', () => {
  it.each(GOLDEN)(
    'face $faceMm mm → $facePx px',
    ({ faceMm, facePx }) => {
      expect(mmToPx(faceMm, 300)).toBe(facePx);
    },
  );

  it.each(GOLDEN)(
    'arte $artMm mm → $artPx px',
    ({ artMm, artPx }) => {
      expect(mmToPx(artMm, 300)).toBe(artPx);
    },
  );

  it.each(GOLDEN)(
    'sangria $bleedMm mm → $bleedPx px por lado',
    ({ bleedMm, bleedPx }) => {
      expect(mmToPx(bleedMm, 300)).toBe(bleedPx);
    },
  );

  it.each(GOLDEN)(
    'invariante face@300 + 2*bleed@300 ≈ art@300 para $faceMm mm',
    ({ faceMm, artMm, bleedMm }) => {
      const reconstructed = mmToPx(faceMm, 300) + 2 * mmToPx(bleedMm, 300);
      expect(Math.abs(reconstructed - mmToPx(artMm, 300))).toBeLessThanOrEqual(1);
    },
  );

  it.each(GOLDEN)(
    'art@300 de $faceMm mm cabe no caminho síncrono (<900px)',
    ({ artPx }) => {
      expect(artPx).toBeLessThan(900);
    },
  );
});
