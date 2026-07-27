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
});
