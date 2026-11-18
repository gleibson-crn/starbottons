import { TestBed } from '@angular/core/testing';
import { ModalService } from '../../shared/ui';
import { vi } from 'vitest';
import { FrameTemplateService, type FrameTemplate } from '../../core/frames';
import { FramesManagerPage } from './frames-manager.page';

const EXISTING: FrameTemplate = {
  id: 'f1',
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

const SAVED: FrameTemplate = {
  ...EXISTING,
  id: 'f2',
  name: 'Estrelas',
  storagePath: 'user/estrelas.png',
};

let confirmAnswer = true;
const fakeModal = { showConfirm: async (): Promise<boolean> => confirmAnswer };

const removed: FrameTemplate[] = [];

const fakeService: Pick<FrameTemplateService, 'list' | 'save' | 'remove'> = {
  list: async (): Promise<FrameTemplate[]> => [EXISTING],
  save: async (): Promise<FrameTemplate> => SAVED,
  remove: async (t: FrameTemplate): Promise<void> => {
    removed.push(t);
  },
};

const PNG = (): File => new File(['x'], 'estrelas.png', { type: 'image/png' });

describe('FramesManagerPage', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  function build(): FramesManagerPage {
    TestBed.configureTestingModule({
      providers: [
        { provide: FrameTemplateService, useValue: fakeService },
        { provide: ModalService, useValue: fakeModal },
      ],
    });
    const fixture = TestBed.createComponent(FramesManagerPage);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('a dropzone aceita somente PNG', () => {
    const cmp = build();
    expect(cmp.accept).toEqual(['image/png']);
  });

  it('carrega as molduras existentes no ngOnInit', async () => {
    const cmp = build();
    await cmp.reload();
    expect(cmp.templates().length).toBe(1);
    expect(cmp.phase()).toBe('ready');
  });

  it('canSave exige nome e arquivo', () => {
    const cmp = build();
    expect(cmp.canSave()).toBe(false);
    cmp.name.set('Estrelas');
    expect(cmp.canSave()).toBe(false);
    cmp.onFile(PNG());
    expect(cmp.canSave()).toBe(true);
  });

  it('save adiciona a nova moldura ao topo e limpa o formulário', async () => {
    const cmp = build();
    await cmp.reload();
    cmp.name.set('Estrelas');
    cmp.onFile(PNG());

    await cmp.save();

    expect(cmp.templates()[0].id).toBe('f2');
    expect(cmp.templates().length).toBe(2);
    expect(cmp.name()).toBe('');
    expect(cmp.pendingFile()).toBeNull();
  });

  it('edit abre o montador e closeEditor fecha', async () => {
    const cmp = build();
    await cmp.reload();
    cmp.edit(EXISTING);
    expect(cmp.editing()).toBe(EXISTING);
    cmp.closeEditor();
    expect(cmp.editing()).toBeNull();
  });

  it('onComposed atualiza o card (selo composta) e mantém o editor aberto', async () => {
    const cmp = build();
    await cmp.reload();
    cmp.edit(EXISTING);
    const updated = { ...EXISTING, isComposite: true, thumbUrl: 'https://app/novo.png' };
    cmp.onComposed(updated);
    expect(cmp.editing()).toBe(updated);
    expect(cmp.templates()[0].isComposite).toBe(true);
    expect(cmp.templates()[0].thumbUrl).toBe('https://app/novo.png');
  });

  it('removeTemplate exclui após confirmação', async () => {
    removed.length = 0;
    confirmAnswer = true;
    const cmp = build();
    await cmp.reload();

    await cmp.removeTemplate(EXISTING);

    expect(removed).toContain(EXISTING);
    expect(cmp.templates().length).toBe(0);
  });

  it('removeTemplate não exclui quando o usuário cancela', async () => {
    removed.length = 0;
    confirmAnswer = false;
    const cmp = build();
    await cmp.reload();

    await cmp.removeTemplate(EXISTING);

    expect(removed.length).toBe(0);
    expect(cmp.templates().length).toBe(1);
  });
});
