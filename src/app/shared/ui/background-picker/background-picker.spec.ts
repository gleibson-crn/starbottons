/**
 * BackgroundPicker — escolhe a cor de fundo sólida (camada sob a imagem).
 * Cobre: feature-detect da EyeDropper API (com e sem `window.EyeDropper`),
 * mudança de cor, "restaurar branco" e o fluxo do conta-gotas (aplica /
 * ignora cancelamento). A EyeDropper é mockada no `window`.
 */
import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BackgroundPicker, WHITE_BG } from './background-picker';

interface WinWithEye {
  EyeDropper?: unknown;
}

/** Instala um stub newable da EyeDropper que resolve/rejeita `open()`. */
function stubEyeDropper(
  win: WinWithEye,
  open: () => Promise<{ sRGBHex: string }>,
): void {
  win.EyeDropper = function () {
    return { open };
  };
}

function makePicker(
  initial = WHITE_BG,
): { cmp: BackgroundPicker; ref: ComponentRef<BackgroundPicker>; fixture: ComponentFixture<BackgroundPicker> } {
  const fixture = TestBed.createComponent(BackgroundPicker);
  fixture.componentRef.setInput('color', initial);
  fixture.detectChanges();
  return { cmp: fixture.componentInstance, ref: fixture.componentRef, fixture };
}

describe('BackgroundPicker', () => {
  const win = window as unknown as WinWithEye;
  let originalEye: unknown;

  beforeEach(() => {
    originalEye = win.EyeDropper;
    delete win.EyeDropper;
  });

  afterEach(() => {
    if (originalEye === undefined) {
      delete win.EyeDropper;
    } else {
      win.EyeDropper = originalEye;
    }
  });

  describe('feature-detect do conta-gotas', () => {
    it('supportsEyeDropper = false quando o navegador não expõe a API', () => {
      const { cmp } = makePicker();
      expect(cmp.supportsEyeDropper).toBe(false);
    });

    it('supportsEyeDropper = true quando window.EyeDropper existe', () => {
      stubEyeDropper(win, () => Promise.resolve({ sRGBHex: '#000000' }));
      const { cmp } = makePicker();
      expect(cmp.supportsEyeDropper).toBe(true);
    });
  });

  describe('mudança de cor', () => {
    it('onColorInput emite a nova cor no model', () => {
      const { cmp } = makePicker();
      cmp.onColorInput('#ff00aa');
      expect(cmp.color()).toBe('#ff00aa');
    });
  });

  describe('restaurar branco', () => {
    it('volta a cor para branco', () => {
      const { cmp } = makePicker('#123456');
      expect(cmp.isWhite()).toBe(false);
      cmp.restoreWhite();
      expect(cmp.color()).toBe(WHITE_BG);
      expect(cmp.isWhite()).toBe(true);
    });

    it('isWhite ignora caixa (case-insensitive)', () => {
      const { cmp } = makePicker('#FFFFFF');
      expect(cmp.isWhite()).toBe(true);
    });
  });

  describe('conta-gotas (EyeDropper API)', () => {
    it('aplica a cor amostrada', async () => {
      stubEyeDropper(win, () => Promise.resolve({ sRGBHex: '#abcdef' }));
      const { cmp } = makePicker();
      await cmp.pickWithEyeDropper();
      expect(cmp.color()).toBe('#abcdef');
    });

    it('ignora o cancelamento (open rejeita) sem quebrar', async () => {
      stubEyeDropper(win, () => Promise.reject(new Error('cancelado')));
      const { cmp } = makePicker('#222222');
      await cmp.pickWithEyeDropper();
      expect(cmp.color()).toBe('#222222');
    });

    it('não faz nada quando a API é indisponível', async () => {
      const { cmp } = makePicker('#333333');
      await cmp.pickWithEyeDropper();
      expect(cmp.color()).toBe('#333333');
    });
  });
});
