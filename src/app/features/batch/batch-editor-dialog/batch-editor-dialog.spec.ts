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
import {
  BackgroundTemplateService,
  type BackgroundTemplate,
} from '../../../core/backgrounds';
import { BatchEditorDialog, type BatchEditResult } from './batch-editor-dialog';

const TPL: BackgroundTemplate = {
  id: 'bg1',
  name: 'Céu estrelado',
  storagePath: 'user/ceu.png',
  mime: 'image/png',
  width: 1200,
  height: 1200,
  createdAt: '2026-07-25T10:00:00Z',
  thumbUrl: 'https://app/ceu.png?token=x',
};

/** BackgroundTemplateService de teste: não toca em rede/Storage. */
const fakeBgTemplates: Pick<BackgroundTemplateService, 'list'> = {
  list: async (): Promise<BackgroundTemplate[]> => [TPL],
};

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

function fixtureWith(item: BatchItem) {
  TestBed.configureTestingModule({
    providers: [
      { provide: UploadService, useValue: fakeUploads },
      { provide: BackgroundTemplateService, useValue: fakeBgTemplates },
    ],
  });
  const fixture = TestBed.createComponent(BatchEditorDialog);
  fixture.componentRef.setInput('item', item);
  fixture.detectChanges();
  return fixture;
}

function dialogWith(item: BatchItem): BatchEditorDialog {
  return fixtureWith(item).componentInstance;
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

  it('loadBgTemplates popula a galeria e marca a fase ready', async () => {
    const cmp = dialogWith(makeItem());
    await cmp.loadBgTemplates();
    expect(cmp.bgTemplates().length).toBe(1);
    expect(cmp.bgTemplates()[0].id).toBe('bg1');
    expect(cmp.bgGalleryPhase()).toBe('ready');
  });

  it('pickTemplate define transform.backgroundImage a partir do template', () => {
    const cmp = dialogWith(makeItem());
    cmp.pickTemplate(TPL);

    const bg = cmp.transform().backgroundImage;
    expect(bg?.source).toBe('template');
    expect(bg?.id).toBe('bg1');
    expect(bg?.path).toBe('user/ceu.png');
    expect(bg?.url).toBe('https://app/ceu.png?token=x');
  });

  it('a imagem de fundo de um template viaja no transform ao salvar', () => {
    const cmp = dialogWith(makeItem());
    cmp.pickTemplate(TPL);

    let result: BatchEditResult | undefined;
    cmp.saved.subscribe((r) => (result = r));
    cmp.onSave();

    expect(result?.transform.backgroundImage?.id).toBe('bg1');
    expect(result?.transform.backgroundImage?.source).toBe('template');
  });

});

describe('BatchEditorDialog — posicionamento do fundo', () => {
  const bgItem = (framing: {
    offset: { x: number; y: number };
    scale: number;
    rotation: number;
  }): BatchItem => {
    const base = makeItem();
    return {
      ...base,
      transform: {
        ...base.transform,
        backgroundImage: {
          path: 'p',
          url: 'blob:u',
          source: 'upload',
          ...framing,
        },
      },
    };
  };

  it('bgLayer é "art" por padrão (aba Ajustar)', () => {
    const cmp = dialogWith(makeItem());
    expect(cmp.bgLayer()).toBe('art');
  });

  it('bgLayer vira "background" na aba Fundo quando há imagem', () => {
    const cmp = dialogWith(bgItem({ offset: { x: 0, y: 0 }, scale: 1, rotation: 0 }));
    cmp.selectTab('background');
    expect(cmp.bgLayer()).toBe('background');
  });

  it('bgLayer continua "art" na aba Fundo se NÃO há imagem', () => {
    const cmp = dialogWith(makeItem());
    cmp.selectTab('background');
    expect(cmp.bgLayer()).toBe('art');
  });

  it('semeia bgTransform a partir de transform.backgroundImage no ngOnInit', () => {
    const cmp = dialogWith(
      bgItem({ offset: { x: 3, y: 4 }, scale: 1.5, rotation: 20 }),
    );
    expect(cmp.bgTransform()).toEqual({
      offset: { x: 3, y: 4 },
      scale: 1.5,
      rotation: 20,
    });
  });

  it('bgTransform começa no neutro quando o item não tem fundo', () => {
    const cmp = dialogWith(makeItem());
    expect(cmp.bgTransform()).toEqual({
      offset: { x: 0, y: 0 },
      scale: 1,
      rotation: 0,
    });
  });

  it('mudar bgTransform persiste em transform.backgroundImage (effect)', () => {
    const fixture = fixtureWith(
      bgItem({ offset: { x: 0, y: 0 }, scale: 1, rotation: 0 }),
    );
    const cmp = fixture.componentInstance;
    cmp.bgTransform.set({ offset: { x: 5, y: 7 }, scale: 2, rotation: 10 });
    fixture.detectChanges();

    const bg = cmp.transform().backgroundImage;
    expect(bg?.offset).toEqual({ x: 5, y: 7 });
    expect(bg?.scale).toBe(2);
    expect(bg?.rotation).toBe(10);
  });

  it('o posicionamento do fundo viaja no transform ao salvar', () => {
    const fixture = fixtureWith(
      bgItem({ offset: { x: 0, y: 0 }, scale: 1, rotation: 0 }),
    );
    const cmp = fixture.componentInstance;
    cmp.bgTransform.set({ offset: { x: 8, y: -2 }, scale: 1.25, rotation: 15 });
    fixture.detectChanges();

    let result: BatchEditResult | undefined;
    cmp.saved.subscribe((r) => (result = r));
    cmp.onSave();

    expect(result?.transform.backgroundImage?.offset).toEqual({ x: 8, y: -2 });
    expect(result?.transform.backgroundImage?.scale).toBe(1.25);
    expect(result?.transform.backgroundImage?.rotation).toBe(15);
  });

  it('resetBackground zera o enquadramento do fundo', () => {
    const cmp = dialogWith(
      bgItem({ offset: { x: 9, y: 9 }, scale: 3, rotation: 45 }),
    );
    cmp.resetBackground();
    expect(cmp.bgTransform()).toEqual({
      offset: { x: 0, y: 0 },
      scale: 1,
      rotation: 0,
    });
  });

  it('escolher novo template reinicia a posição do fundo', () => {
    const cmp = dialogWith(
      bgItem({ offset: { x: 9, y: 9 }, scale: 3, rotation: 45 }),
    );
    cmp.pickTemplate(TPL);
    expect(cmp.bgTransform()).toEqual({
      offset: { x: 0, y: 0 },
      scale: 1,
      rotation: 0,
    });
  });
});
