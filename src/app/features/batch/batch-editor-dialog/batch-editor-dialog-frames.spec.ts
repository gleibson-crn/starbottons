/**
 * BatchEditorDialog — aba Moldura: empilhar (até 3), remover, ativar,
 * reordenar e enquadrar molduras. Separado do spec principal (max-lines).
 */
import { TestBed } from '@angular/core/testing';
import type { BatchItem } from '../../../core/batch';
import { DEFAULT_FILTERS, DEFAULT_TRANSFORM } from '../../../shared/types';
import type { UploadRecord } from '../../../shared/types';
import { UploadService, type ImageProbe } from '../../../core/upload';
import {
  BackgroundTemplateService,
  type BackgroundTemplate,
} from '../../../core/backgrounds';
import { FrameTemplateService, type FrameTemplate } from '../../../core/frames';
import { BatchEditorDialog, type BatchEditResult } from './batch-editor-dialog';

const FRAME_TPL: FrameTemplate = {
  id: 'fr1',
  name: 'Borda dourada',
  storagePath: 'user/borda.png',
  mime: 'image/png',
  width: 1000,
  height: 1000,
  createdAt: '2026-08-20T10:00:00Z',
  thumbUrl: 'https://app/borda.png?token=x',
  defaultFraming: { offset: { x: 0, y: 0 }, scale: 1, rotation: 0 },
  isComposite: false,
};

const FAKE_REC: UploadRecord = {
  id: 'r1',
  path: 'user/bg.png',
  fileName: 'bg.png',
  width: 100,
  height: 100,
  previewUrl: 'blob:bg',
};

const fakeUploads: Pick<UploadService, 'probe' | 'upload'> = {
  probe: async (): Promise<ImageProbe> => ({ width: 100, height: 100, previewUrl: 'blob:bg' }),
  upload: async (): Promise<UploadRecord> => FAKE_REC,
};

const PNG = (): File => new File(['x'], 'bg.png', { type: 'image/png' });

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

function dialogWith(item: BatchItem): BatchEditorDialog {
  TestBed.configureTestingModule({
    providers: [
      { provide: UploadService, useValue: fakeUploads },
      {
        provide: BackgroundTemplateService,
        useValue: { list: async (): Promise<BackgroundTemplate[]> => [] },
      },
      {
        provide: FrameTemplateService,
        useValue: { list: async (): Promise<FrameTemplate[]> => [FRAME_TPL] },
      },
    ],
  });
  const fixture = TestBed.createComponent(BatchEditorDialog);
  fixture.componentRef.setInput('item', item);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('BatchEditorDialog — moldura', () => {
  const TPL2: FrameTemplate = { ...FRAME_TPL, id: 'fr2', storagePath: 'user/b2.png' };
  const paths = (cmp: BatchEditorDialog): string[] =>
    cmp.transform().frameImages.map((f) => f.path);

  it('expõe a aba "Moldura"', () => {
    const cmp = dialogWith(makeItem());
    cmp.selectTab('frame');
    expect(cmp.activeTab()).toBe('frame');
    expect(cmp.tabs.some((t) => t.id === 'frame')).toBe(true);
  });

  it('a dropzone de moldura aceita somente PNG', () => {
    const cmp = dialogWith(makeItem());
    expect(cmp.frameAccept).toEqual(['image/png']);
  });

  it('começa sem molduras e sem moldura ativa', () => {
    const cmp = dialogWith(makeItem());
    expect(cmp.frames.refs()).toEqual([]);
    expect(cmp.frames.activeIndex()).toBe(-1);
    expect(cmp.frames.canAdd()).toBe(true);
  });

  it('onFrameFile sobe o arquivo e empilha uma moldura com enquadramento neutro', async () => {
    const cmp = dialogWith(makeItem());
    await cmp.frames.addUpload(PNG());

    const frame = cmp.transform().frameImages[0];
    expect(frame.path).toBe('user/bg.png');
    expect(frame.url).toBe('blob:bg');
    expect(frame.source).toBe('upload');
    expect(frame.offset).toEqual({ x: 0, y: 0 });
    expect(frame.scale).toBe(1);
    expect(frame.rotation).toBe(0);
    expect(cmp.frames.uploading()).toBe(false);
  });

  it('empilha até 3 molduras e a nova vira a ativa', async () => {
    const cmp = dialogWith(makeItem());
    await cmp.frames.addUpload(PNG());
    cmp.frames.addTemplate(FRAME_TPL);
    cmp.frames.addTemplate(TPL2);

    expect(cmp.frames.refs().length).toBe(3);
    expect(cmp.frames.activeIndex()).toBe(2);
    expect(cmp.frames.canAdd()).toBe(false);
  });

  it('a 4ª moldura (template) é ignorada', async () => {
    const cmp = dialogWith(makeItem());
    cmp.frames.addTemplate(FRAME_TPL);
    cmp.frames.addTemplate(TPL2);
    cmp.frames.addTemplate(FRAME_TPL);
    cmp.frames.addTemplate(TPL2);

    expect(cmp.frames.refs().length).toBe(3);
  });

  it('a 4ª moldura (upload) é recusada com mensagem de limite', async () => {
    const cmp = dialogWith(makeItem());
    cmp.frames.addTemplate(FRAME_TPL);
    cmp.frames.addTemplate(TPL2);
    cmp.frames.addTemplate(FRAME_TPL);
    await cmp.frames.addUpload(PNG());

    expect(cmp.frames.refs().length).toBe(3);
    expect(cmp.frames.error()).toContain('3');
  });

  it('removeFrameAt remove só a moldura do índice', () => {
    const cmp = dialogWith(makeItem());
    cmp.frames.addTemplate(FRAME_TPL);
    cmp.frames.addTemplate(TPL2);
    cmp.frames.removeAt(0);

    expect(paths(cmp)).toEqual(['user/b2.png']);
  });

  it('removeFrameAt da última ativa reajusta a ativa; sem molduras vira -1', () => {
    const cmp = dialogWith(makeItem());
    cmp.frames.addTemplate(FRAME_TPL);
    cmp.frames.addTemplate(TPL2);
    cmp.frames.removeAt(1);
    expect(cmp.frames.activeIndex()).toBe(0);
    cmp.frames.removeAt(0);
    expect(cmp.frames.activeIndex()).toBe(-1);
  });

  it('selectFrame define a moldura ativa', () => {
    const cmp = dialogWith(makeItem());
    cmp.frames.addTemplate(FRAME_TPL);
    cmp.frames.addTemplate(TPL2);
    cmp.frames.select(0);

    expect(cmp.frames.activeIndex()).toBe(0);
  });

  it('moveFrameUp sobe a moldura e a ativa a acompanha', () => {
    const cmp = dialogWith(makeItem());
    cmp.frames.addTemplate(FRAME_TPL);
    cmp.frames.addTemplate(TPL2);
    cmp.frames.select(0);
    cmp.frames.moveUp(0);

    expect(paths(cmp)).toEqual(['user/b2.png', 'user/borda.png']);
    expect(cmp.frames.activeIndex()).toBe(1);
  });

  it('moveFrameDown desce a moldura; nos extremos é no-op', () => {
    const cmp = dialogWith(makeItem());
    cmp.frames.addTemplate(FRAME_TPL);
    cmp.frames.addTemplate(TPL2);
    cmp.frames.moveDown(0);
    cmp.frames.moveUp(1);
    expect(paths(cmp)).toEqual(['user/borda.png', 'user/b2.png']);

    cmp.frames.moveDown(1);
    expect(paths(cmp)).toEqual(['user/b2.png', 'user/borda.png']);
  });

  it('onFrameFramingChange atualiza só o enquadramento da moldura indicada', () => {
    const cmp = dialogWith(makeItem());
    cmp.frames.addTemplate(FRAME_TPL);
    cmp.frames.addTemplate(TPL2);
    cmp.frames.applyFraming({ index: 0, framing: { offset: { x: 5, y: 6 }, scale: 2, rotation: 15 } });

    expect(cmp.frames.framings()[0]).toEqual({ offset: { x: 5, y: 6 }, scale: 2, rotation: 15 });
    expect(cmp.frames.framings()[1]).toEqual({ offset: { x: 0, y: 0 }, scale: 1, rotation: 0 });
  });

  it('resetActiveFrame zera o enquadramento da ativa; sem ativa é no-op', () => {
    const cmp = dialogWith(makeItem());
    cmp.frames.resetActive();
    cmp.frames.addTemplate(FRAME_TPL);
    cmp.frames.applyFraming({ index: 0, framing: { offset: { x: 5, y: 6 }, scale: 2, rotation: 15 } });
    cmp.frames.resetActive();

    expect(cmp.frames.framings()[0]).toEqual({ offset: { x: 0, y: 0 }, scale: 1, rotation: 0 });
  });

  it('as molduras viajam no transform ao salvar', async () => {
    const cmp = dialogWith(makeItem());
    await cmp.frames.addUpload(PNG());

    let result: BatchEditResult | undefined;
    cmp.saved.subscribe((r) => (result = r));
    cmp.onSave();

    expect(result?.transform.frameImages[0].path).toBe('user/bg.png');
  });

  it('loadFrameTemplates popula a galeria e marca a fase ready', async () => {
    const cmp = dialogWith(makeItem());
    await cmp.loadFrameTemplates();
    expect(cmp.frameTemplates().length).toBe(1);
    expect(cmp.frameTemplates()[0].id).toBe('fr1');
    expect(cmp.frameGalleryPhase()).toBe('ready');
  });

  it('pickFrameTemplate empilha a moldura a partir do template', () => {
    const cmp = dialogWith(makeItem());
    cmp.frames.addTemplate(FRAME_TPL);

    const frame = cmp.transform().frameImages[0];
    expect(frame.source).toBe('template');
    expect(frame.id).toBe('fr1');
    expect(frame.path).toBe('user/borda.png');
    expect(frame.url).toBe('https://app/borda.png?token=x');
  });

  it('a moldura de um template viaja no transform ao salvar', () => {
    const cmp = dialogWith(makeItem());
    cmp.frames.addTemplate(FRAME_TPL);

    let result: BatchEditResult | undefined;
    cmp.saved.subscribe((r) => (result = r));
    cmp.onSave();

    expect(result?.transform.frameImages[0].id).toBe('fr1');
    expect(result?.transform.frameImages[0].source).toBe('template');
  });
});

