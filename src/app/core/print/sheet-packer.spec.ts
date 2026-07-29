import { A4, packSheet, type PageSpec, type PlacedPiece, type SheetInput } from './sheet-packer';

/** artMm esperado por tamanho nominal (golden matrix). */
const ART_MM = { 32: 44, 44: 54, 58: 70 } as const;

/** Tolerância p/ comparações geométricas em mm (varredura de 1mm). */
const EPS = 1e-6;

function input(patch: Partial<SheetInput> = {}): SheetInput {
  return { id: 'a', url: 'blob:a', sizeMm: 32, quantity: 1, ...patch };
}

/** Todas as peças de todas as páginas, achatadas. */
function allPieces(pages: PlacedPiece[][]): PlacedPiece[] {
  return pages.flat();
}

/** Centro do círculo de uma peça (canto da bbox + raio). */
function center(p: PlacedPiece): { cx: number; cy: number; r: number } {
  const r = p.artMm / 2;
  return { cx: p.xMm + r, cy: p.yMm + r, r };
}

/** Distância entre os centros de dois círculos (mm). */
function centerDist(a: PlacedPiece, b: PlacedPiece): number {
  const ca = center(a);
  const cb = center(b);
  return Math.hypot(ca.cx - cb.cx, ca.cy - cb.cy);
}

/** Capacidade por página do layout ANTIGO em grade de quadrados (shelf). */
function squareGrid(artMm: number, page: PageSpec = A4): number {
  const usableW = page.widthMm - 2 * page.marginMm;
  const usableH = page.heightMm - 2 * page.marginMm;
  const cell = artMm + page.gapMm;
  const cols = Math.floor((usableW + page.gapMm) / cell);
  const rows = Math.floor((usableH + page.gapMm) / cell);
  return cols * rows;
}

/** Círculos dentro da área útil (bbox respeita a margem)? */
function assertWithinMargin(page: PlacedPiece[]): void {
  for (const p of page) {
    expect(p.xMm).toBeGreaterThanOrEqual(A4.marginMm - EPS);
    expect(p.yMm).toBeGreaterThanOrEqual(A4.marginMm - EPS);
    expect(p.xMm + p.artMm).toBeLessThanOrEqual(A4.widthMm - A4.marginMm + EPS);
    expect(p.yMm + p.artMm).toBeLessThanOrEqual(A4.heightMm - A4.marginMm + EPS);
  }
}

/** Nenhum par de círculos com centros a menos de r_i + r_j + gap. */
function assertNoCircleCollision(page: PlacedPiece[]): void {
  for (let i = 0; i < page.length; i++) {
    for (let j = i + 1; j < page.length; j++) {
      const minDist = page[i].artMm / 2 + page[j].artMm / 2 + A4.gapMm;
      expect(centerDist(page[i], page[j])).toBeGreaterThanOrEqual(minDist - EPS);
    }
  }
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

  it('respeita exatamente a folga (gap) entre dois círculos vizinhos', () => {
    const packed = packSheet([input({ quantity: 2 })]);
    const [first, second] = packed.pages[0];
    // Centros a exatamente r + r + gap: 2ª peça encostada à direita da 1ª.
    expect(centerDist(first, second)).toBeCloseTo(first.artMm / 2 + second.artMm / 2 + A4.gapMm, 6);
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

  it('invariante: círculos nunca colidem e ficam dentro da margem (tamanhos mistos)', () => {
    const packed = packSheet([
      input({ id: 'g', sizeMm: 58, quantity: 20 }),
      input({ id: 'm', sizeMm: 44, quantity: 20 }),
      input({ id: 'p', sizeMm: 32, quantity: 20 }),
    ]);
    for (const page of packed.pages) {
      assertWithinMargin(page);
      assertNoCircleCollision(page);
    }
    expect(allPieces(packed.pages).length).toBe(60);
  });

  it('gera múltiplas páginas no overflow e não perde peças', () => {
    const many = packSheet([input({ sizeMm: 58, quantity: 120 })]);
    expect(many.pages.length).toBeGreaterThan(1);
    expect(allPieces(many.pages).length).toBe(120);
  });

  it('é determinístico (mesma entrada → mesma saída)', () => {
    const items = [
      input({ id: 'g', sizeMm: 58, quantity: 5 }),
      input({ id: 'p', sizeMm: 32, quantity: 15 }),
    ];
    expect(packSheet(items)).toEqual(packSheet(items));
  });

  it('utilizationPct é plausível (0<pct<=100)', () => {
    const small = packSheet([input({ sizeMm: 32, quantity: 30 })]);
    const big = packSheet([input({ sizeMm: 58, quantity: 30 })]);
    for (const pct of [small.utilizationPct, big.utilizationPct]) {
      expect(pct).toBeGreaterThan(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });

  describe('densidade — mais denso que o shelf em grade de quadrados', () => {
    it('empacota círculos de 58mm em MENOS páginas que a grade quadrada', () => {
      // Grade quadrada: 6 por página (2x3) → 7 peças = 2 páginas.
      const gridCap = squareGrid(ART_MM[58]);
      expect(gridCap).toBe(6);
      const packed = packSheet([input({ sizeMm: 58, quantity: 7 })]);
      expect(packed.pages.length).toBe(1); // círculos nestlam → 7+ numa página
      expect(packed.pages[0].length).toBe(7);
      // ...e sem violar nenhuma invariante:
      assertWithinMargin(packed.pages[0]);
      assertNoCircleCollision(packed.pages[0]);
    });

    it('cabem MAIS círculos de 58mm por página que na grade quadrada', () => {
      const packed = packSheet([input({ sizeMm: 58, quantity: 30 })]);
      expect(packed.pages[0].length).toBeGreaterThan(squareGrid(ART_MM[58]));
    });

    it('nunca usa MAIS páginas que a grade quadrada (32/44/58mm)', () => {
      for (const sizeMm of [32, 44, 58] as const) {
        const n = 50;
        const gridPages = Math.ceil(n / squareGrid(ART_MM[sizeMm]));
        const packed = packSheet([input({ sizeMm, quantity: n })]);
        expect(packed.pages.length).toBeLessThanOrEqual(gridPages);
      }
    });

    it('aproveita os vãos: peças mistas cabem numa única página densamente', () => {
      // 1 grande (58mm) + 10 pequenas (32mm) nestlam ao redor → 1 página.
      const packed = packSheet([
        input({ id: 'g', sizeMm: 58, quantity: 1 }),
        input({ id: 'p', sizeMm: 32, quantity: 10 }),
      ]);
      expect(packed.pages.length).toBe(1);
      expect(packed.pages[0].length).toBe(11);
      assertNoCircleCollision(packed.pages[0]);
      assertWithinMargin(packed.pages[0]);
    });
  });

  describe('arquitetura agnóstica de forma', () => {
    it('shape default é circle: exercita o laço genérico via geometria de círculo', () => {
      // `shape` omitido e `shape:'circle'` explícito produzem o mesmo layout.
      const withoutShape = packSheet([input({ sizeMm: 44, quantity: 6 })]);
      const withCircle = packSheet([input({ sizeMm: 44, quantity: 6, shape: 'circle' })]);
      expect(withCircle).toEqual(withoutShape);
      // O laço genérico posicionou pela bbox e a colisão de círculo foi aplicada.
      assertNoCircleCollision(withCircle.pages[0]);
      assertWithinMargin(withCircle.pages[0]);
    });
  });
});
