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
import type { UploadRecord } from '../../../shared/types';
import { UploadService, type ImageProbe } from '../../../core/upload';
import { BatchEditorDialog, type BatchEditResult } from './batch-editor-dialog';

const FAKE_REC: UploadRecord = {
  id: 'r1',
  path: 'user/bg.png',
  fileName: 'bg.png',
  width: 100,
  height: 100,
  previewUrl: 'blob:bg',
};

/** UploadService de teste: não toca em rede/Storage. */
const fakeUploads: Pick<UploadService, 'probe' | 'upload'> = {
  probe: async (): Promise<ImageProbe> => ({
    width: 100,
    height: 100,
    previewUrl: 'blob:bg',
  }),
  upload: async (): Promise<UploadRecord> => FAKE_REC,
};

const PNG = (): File => new File(['x'], 'bg.png', { type: 'image/png' });

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
  TestBed.configureTestingModule({
    providers: [{ provide: UploadService, useValue: fakeUploads }],
  });
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

describe('BatchEditorDialog — imagem de fundo', () => {
  it('o painel "Fundo" começa no modo cor', () => {
    const cmp = dialogWith(makeItem());
    expect(cmp.bgMode()).toBe('color');
  });

  it('setBgMode alterna entre cor e imagem', () => {
    const cmp = dialogWith(makeItem());
    cmp.setBgMode('image');
    expect(cmp.bgMode()).toBe('image');
    cmp.setBgMode('color');
    expect(cmp.bgMode()).toBe('color');
  });

  it('onBackgroundFile sobe o arquivo e define transform.backgroundImage', async () => {
    const cmp = dialogWith(makeItem());
    await cmp.onBackgroundFile(PNG());

    const bg = cmp.transform().backgroundImage;
    expect(bg?.path).toBe('user/bg.png');
    expect(bg?.url).toBe('blob:bg');
    expect(bg?.source).toBe('upload');
    expect(cmp.bgUploading()).toBe(false);
  });

  it('removeBackgroundImage volta a usar a cor (null)', async () => {
    const cmp = dialogWith(makeItem());
    await cmp.onBackgroundFile(PNG());
    cmp.removeBackgroundImage();
    expect(cmp.transform().backgroundImage).toBeNull();
  });

  it('a imagem de fundo viaja no transform ao salvar', async () => {
    const cmp = dialogWith(makeItem());
    await cmp.onBackgroundFile(PNG());

    let result: BatchEditResult | undefined;
    cmp.saved.subscribe((r) => (result = r));
    cmp.onSave();

    expect(result?.transform.backgroundImage?.path).toBe('user/bg.png');
  });

  it('semeia o modo "imagem" quando o item já tem backgroundImage', () => {
    const base = makeItem();
    const item: BatchItem = {
      ...base,
      transform: {
        ...base.transform,
        backgroundImage: { path: 'p', url: 'blob:u', source: 'upload' },
      },
    };
    const cmp = dialogWith(item);
    expect(cmp.bgMode()).toBe('image');
  });
});
