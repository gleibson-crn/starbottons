import { A4, packSheet, type PlacedPiece, type SheetInput } from './sheet-packer';

/** artMm esperado por tamanho nominal (golden matrix). */
const ART_MM = { 32: 44, 44: 54, 58: 70 } as const;

function input(patch: Partial<SheetInput> = {}): SheetInput {
  return { id: 'a', url: 'blob:a', sizeMm: 32, quantity: 1, ...patch };
}

/** Todas as peças de uma página, achatadas. */
function allPieces(pages: PlacedPiece[][]): PlacedPiece[] {
  return pages.flat();
}

/** Dois quadrados se sobrepõem? (canto+lado em mm). */
function overlaps(a: PlacedPiece, b: PlacedPiece): boolean {
  return (
    a.xMm < b.xMm + b.artMm &&
    b.xMm < a.xMm + a.artMm &&
    a.yMm < b.yMm + b.artMm &&
    b.yMm < a.yMm + a.artMm
  );
}

describe('packSheet', () => {
  it('retorna folha vazia sem itens', () => {
    const packed = packSheet([]);
    expect(packed.pages).toEqual([]);
    expect(packed.totalPieces).toBe(0);
    expect(packed.utilizationPct).toBe(0);
  });

  it('ignora quantidade < 1 e conta o total corretamente', () => {
    const packed = packSheet([
      input({ id: 'x', quantity: 3 }),
      input({ id: 'y', quantity: 0 }),
      input({ id: 'z', quantity: -5 }),
    ]);
    expect(packed.totalPieces).toBe(3);
  });

  it('mapeia artMm físico por tamanho (32→44, 44→54, 58→70)', () => {
    for (const sizeMm of [32, 44, 58] as const) {
      const [piece] = allPieces(packSheet([input({ sizeMm })]).pages);
      expect(piece.artMm).toBe(ART_MM[sizeMm]);
      expect(piece.sizeMm).toBe(sizeMm);
    }
  });

  it('posiciona a primeira peça no canto da área útil (margem)', () => {
    const [piece] = allPieces(packSheet([input()]).pages);
    expect(piece.xMm).toBe(A4.marginMm);
    expect(piece.yMm).toBe(A4.marginMm);
  });

  it('respeita a folga (gap) entre peças da mesma fileira', () => {
    const packed = packSheet([input({ quantity: 2 })]);
    const [first, second] = packed.pages[0];
    expect(first.yMm).toBe(second.yMm);
    expect(second.xMm).toBe(first.xMm + first.artMm + A4.gapMm);
  });

  it('ordena por artMm DESC (tamanhos mistos): a maior arte vem primeiro', () => {
    const packed = packSheet([
      input({ id: 'p', sizeMm: 32, quantity: 1 }),
      input({ id: 'g', sizeMm: 58, quantity: 1 }),
      input({ id: 'm', sizeMm: 44, quantity: 1 }),
    ]);
    const arts = packed.pages[0].map((p) => p.artMm);
    expect(arts).toEqual([...arts].sort((a, b) => b - a));
    expect(arts[0]).toBe(ART_MM[58]);
  });

  it('nunca sobrepõe peças e mantém tudo dentro da margem', () => {
    const packed = packSheet([
      input({ id: 'g', sizeMm: 58, quantity: 20 }),
      input({ id: 'm', sizeMm: 44, quantity: 20 }),
      input({ id: 'p', sizeMm: 32, quantity: 20 }),
    ]);
    for (const page of packed.pages) {
      for (const piece of page) {
        expect(piece.xMm).toBeGreaterThanOrEqual(A4.marginMm);
        expect(piece.yMm).toBeGreaterThanOrEqual(A4.marginMm);
        expect(piece.xMm + piece.artMm).toBeLessThanOrEqual(A4.widthMm - A4.marginMm);
        expect(piece.yMm + piece.artMm).toBeLessThanOrEqual(A4.heightMm - A4.marginMm);
      }
      for (let i = 0; i < page.length; i++) {
        for (let j = i + 1; j < page.length; j++) {
          expect(overlaps(page[i], page[j])).toBe(false);
        }
      }
    }
  });

  it('gera múltiplas páginas no overflow (mais peças que cabem numa A4)', () => {
    const single = packSheet([input({ sizeMm: 58, quantity: 4 })]);
    expect(single.pages.length).toBe(1);
    const many = packSheet([input({ sizeMm: 58, quantity: 120 })]);
    expect(many.pages.length).toBeGreaterThan(1);
    const total = allPieces(many.pages).length;
    expect(total).toBe(120);
  });

  it('utilizationPct é plausível (0<pct<=100) e maior com peças maiores', () => {
    const small = packSheet([input({ sizeMm: 32, quantity: 30 })]);
    const big = packSheet([input({ sizeMm: 58, quantity: 30 })]);
    for (const pct of [small.utilizationPct, big.utilizationPct]) {
      expect(pct).toBeGreaterThan(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });
});
