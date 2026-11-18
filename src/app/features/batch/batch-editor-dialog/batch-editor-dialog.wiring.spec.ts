/**
 * BatchEditorDialog — wiring com o AiStylePanel (BL-001). A seção "Estilo com
 * IA" virou um componente-filho; a prévia (canvas) permanece no diálogo. Estes
 * testes cobrem o contrato: `onSave` lê `aiStyled`/`generationUpload` do painel
 * filho, e `onAiResult` aplica na prévia o que o painel emite via `resultChange`.
 */
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { BatchItem } from '../../../core/batch';
import {
  DEFAULT_FILTERS,
  DEFAULT_TRANSFORM,
  type ImageFilters,
  type UploadRecord,
} from '../../../shared/types';
import { UploadService, type ImageProbe } from '../../../core/upload';
import { BackgroundTemplateService } from '../../../core/backgrounds';
import { FrameTemplateService } from '../../../core/frames';
import { AiStylePanel } from '../ai-style-panel/ai-style-panel';
import { BatchEditorDialog, type BatchEditResult } from './batch-editor-dialog';

const FAKE_REC: UploadRecord = {
  id: 'r1',
  path: 'user/bg.png',
  fileName: 'bg.png',
  width: 100,
  height: 100,
  previewUrl: 'blob:bg',
};

const fakeUploads: Pick<UploadService, 'probe' | 'upload'> = {
  probe: async (): Promise<ImageProbe> => ({
    width: 100,
    height: 100,
    previewUrl: 'blob:bg',
  }),
  upload: async (): Promise<UploadRecord> => FAKE_REC,
};

const fakeBgTemplates: Pick<BackgroundTemplateService, 'list'> = {
  list: async () => [],
};

const fakeFrameTemplates: Pick<FrameTemplateService, 'list'> = {
  list: async () => [],
};

const VIVID: ImageFilters = {
  brightness: 1,
  contrast: 1.15,
  saturate: 1.4,
  effect: 'none',
};

function makeItem(): BatchItem {
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
    filters: DEFAULT_FILTERS,
    generationUpload: null,
    selectedSizes: new Set([32, 44, 58]),
    perSizeDpi: dpi,
    perSizeTier: { 32: 'ok', 44: 'ok', 58: 'ok' },
    arts: {},
    uploadError: null,
    seqLabel: '',
  };
}

function fixtureWith(item: BatchItem) {
  TestBed.configureTestingModule({
    providers: [
      { provide: UploadService, useValue: fakeUploads },
      { provide: BackgroundTemplateService, useValue: fakeBgTemplates },
      { provide: FrameTemplateService, useValue: fakeFrameTemplates },
    ],
  });
  const fixture = TestBed.createComponent(BatchEditorDialog);
  fixture.componentRef.setInput('item', item);
  fixture.detectChanges();
  return fixture;
}

describe('BatchEditorDialog — wiring do AiStylePanel', () => {
  it('onSave lê aiStyled/generationUpload do AiStylePanel filho', () => {
    const styledUpload: UploadRecord = {
      id: 's1',
      path: 't',
      fileName: 'arte-tratado.png',
      width: 800,
      height: 600,
      previewUrl: 'blob:styled',
    };
    const fixture = fixtureWith(makeItem());
    const panel = fixture.debugElement.query(
      By.directive(AiStylePanel),
    ).componentInstance as AiStylePanel;
    // Simula um resultado de IA já aplicado no filho.
    panel.aiStyled.set(true);
    panel.generationUpload.set(styledUpload);

    let result: BatchEditResult | undefined;
    fixture.componentInstance.saved.subscribe((r) => (result = r));
    fixture.componentInstance.onSave();

    expect(result?.aiStyled).toBe(true);
    expect(result?.generationUpload).toBe(styledUpload);
  });

  it('sem IA aplicada, onSave devolve aiStyled=false e generationUpload=null', () => {
    const fixture = fixtureWith(makeItem());
    let result: BatchEditResult | undefined;
    fixture.componentInstance.saved.subscribe((r) => (result = r));
    fixture.componentInstance.onSave();

    expect(result?.aiStyled).toBe(false);
    expect(result?.generationUpload).toBeNull();
  });

  it('onAiResult aplica filtros/estilo do painel na prévia', () => {
    const cmp = fixtureWith(makeItem()).componentInstance;
    cmp.onAiResult({
      image: null,
      filters: VIVID,
      style: cmp.style(),
      upload: null,
      costUsd: null,
      styled: false,
    });
    expect(cmp.filters()).toEqual(VIVID);
  });
});
