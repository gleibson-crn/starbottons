import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { FrameBgEditor } from './frame-bg-editor';

function make(): FrameBgEditor {
  TestBed.configureTestingModule({ imports: [FrameBgEditor] });
  return TestBed.createComponent(FrameBgEditor).componentInstance;
}

describe('FrameBgEditor', () => {
  it('onCutout guarda o recorte só quando ativo e libera "Aplicar"', () => {
    const cmp = make();
    const img = new Image();
    expect(cmp.canApply()).toBe(false);

    cmp.onCutout({ image: img, active: true });
    expect(cmp.cutout()).toBe(img);
    expect(cmp.canApply()).toBe(true);

    cmp.onCutout({ image: img, active: false });
    expect(cmp.cutout()).toBeNull();
    expect(cmp.canApply()).toBe(false);
  });

  it('cancel() emite cancelled', () => {
    const cmp = make();
    let cancelled = false;
    cmp.cancelled.subscribe(() => (cancelled = true));
    cmp.cancel();
    expect(cancelled).toBe(true);
  });
});
