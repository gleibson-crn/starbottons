import { DEFAULT_DPI, mmToPt, mmToPx } from './mm-px';

describe('mm-px conversions', () => {
  describe('mmToPx', () => {
    it('converte 25.4mm (1 polegada) para o DPI em pixels', () => {
      expect(mmToPx(25.4, 300)).toBe(300);
      expect(mmToPx(25.4, 96)).toBe(96);
    });

    it('usa 300 DPI como default', () => {
      expect(mmToPx(25.4)).toBe(DEFAULT_DPI);
      expect(mmToPx(25.4)).toBe(300);
    });

    it('arredonda para o inteiro mais próximo', () => {
      // 32mm @ 300dpi = 377.95... -> 378
      expect(mmToPx(32, 300)).toBe(378);
      // 44mm @ 300dpi = 519.68... -> 520
      expect(mmToPx(44, 300)).toBe(520);
      // 58mm @ 300dpi = 685.03... -> 685
      expect(mmToPx(58, 300)).toBe(685);
    });

    it('retorna 0 para 0mm', () => {
      expect(mmToPx(0)).toBe(0);
    });
  });

  describe('mmToPt', () => {
    it('converte 25.4mm (1 polegada) para 72pt', () => {
      expect(mmToPt(25.4)).toBeCloseTo(72, 10);
    });

    it('não arredonda (mantém fração)', () => {
      // 10mm = 10/25.4*72 = 28.3464...
      expect(mmToPt(10)).toBeCloseTo(28.34645669, 6);
    });

    it('retorna 0 para 0mm', () => {
      expect(mmToPt(0)).toBe(0);
    });
  });
});
