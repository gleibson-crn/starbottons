/**
 * BatchEditorDialog — o diálogo do lote deve expor os filtros do item (semeados
 * no `ngOnInit`) e devolvê-los, junto do enquadramento, ao confirmar. É a base
 * da unificação upload+lote (ADR-014): cada imagem do grid pode ser tratada.
 */
import { TestBed } from '@angular/core/testing';
import type { BatchItem } from '../../../core/batch';
import {
  DEFAULT_FILTERS,
  DEFAULT_TRANSFORM,
  type ImageFilters,
} from '../../../shared/types';
import { BatchEditorDialog, type BatchEditResult } from './batch-editor-dialog';

const VIVID: ImageFilters = {
  brightness: 1,
  contrast: 1.15,
  saturate: 1.4,
  effect: 'none',
};

function makeItem(filters: ImageFilters = DEFAULT_FILTERS): BatchItem {
  const dpi = { 32: 300, 44: 300, 58: 300 } as const;
  return {
    id: 'i1',
    name: 'Arte',
    upload: { id: 'up1', path: 'p', fileName: 'a.png', width: 2000, height: 2000, previewUrl: 'x' },
    fileName: 'a.png',
    previewUrl: 'x',
    width: 2000,
    height: 2000,
    transform: DEFAULT_TRANSFORM,
    editorSide: 512,
    filters,
    generationUpload: null,
    selectedSizes: new Set([32, 44, 58]),
    perSizeDpi: dpi,
    perSizeTier: { 32: 'ok', 44: 'ok', 58: 'ok' },
    arts: {},
    uploadError: null,
  };
}

function dialogWith(item: BatchItem): BatchEditorDialog {
  const fixture = TestBed.createComponent(BatchEditorDialog);
  fixture.componentRef.setInput('item', item);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('BatchEditorDialog — filtros', () => {
  it('semeia os filtros do item no ngOnInit', () => {
    const cmp = dialogWith(makeItem(VIVID));
    expect(cmp.filters()).toEqual(VIVID);
  });

  it('ao salvar devolve transform + filters ao pai', () => {
    const cmp = dialogWith(makeItem());
    cmp.filters.set(VIVID);

    let result: BatchEditResult | undefined;
    cmp.saved.subscribe((r) => (result = r));
    cmp.onSave();

    expect(result?.filters).toEqual(VIVID);
    expect(result?.transform).toEqual(DEFAULT_TRANSFORM);
    expect(typeof result?.editorSide).toBe('number');
  });

  it('começa na aba "Ajustar"', () => {
    const cmp = dialogWith(makeItem());
    expect(cmp.activeTab()).toBe('adjust');
    cmp.selectTab('treat');
    expect(cmp.activeTab()).toBe('treat');
  });

  it('resetFraming zera enquadramento mas preserva o fundo', () => {
    const cmp = dialogWith(makeItem());
    cmp.onBackground('#123456');
    cmp.transform.update((t) => ({
      ...t,
      scale: 2,
      rotation: 30,
      offset: { x: 10, y: 10 },
    }));

    cmp.resetFraming();

    const t = cmp.transform();
    expect(t.scale).toBe(DEFAULT_TRANSFORM.scale);
    expect(t.rotation).toBe(DEFAULT_TRANSFORM.rotation);
    expect(t.offset).toEqual(DEFAULT_TRANSFORM.offset);
    expect(t.background).toBe('#123456');
  });
});

describe('BatchEditorDialog — fundo', () => {
  it('expõe a aba "Fundo"', () => {
    const cmp = dialogWith(makeItem());
    cmp.selectTab('background');
    expect(cmp.activeTab()).toBe('background');
    expect(cmp.tabs.some((t) => t.id === 'background')).toBe(true);
  });

  it('onBackground atualiza transform.background', () => {
    const cmp = dialogWith(makeItem());
    expect(cmp.transform().background).toBe('#ffffff');
    cmp.onBackground('#ff8800');
    expect(cmp.transform().background).toBe('#ff8800');
  });

  it('a cor de fundo sobrevive ao salvar', () => {
    const cmp = dialogWith(makeItem());
    cmp.onBackground('#00aaff');

    let result: BatchEditResult | undefined;
    cmp.saved.subscribe((r) => (result = r));
    cmp.onSave();

    expect(result?.transform.background).toBe('#00aaff');
  });
});
