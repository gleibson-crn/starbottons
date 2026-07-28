import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import {
  BackgroundTemplateService,
  type BackgroundTemplate,
} from '../../core/backgrounds';
import { BackgroundsManagerPage } from './backgrounds-manager.page';

const EXISTING: BackgroundTemplate = {
  id: 'b1',
  name: 'Céu estrelado',
  storagePath: 'user/ceu.png',
  mime: 'image/png',
  width: 1200,
  height: 1200,
  createdAt: '2026-07-25T10:00:00Z',
  thumbUrl: 'https://app/ceu.png?token=x',
};

const SAVED: BackgroundTemplate = {
  ...EXISTING,
  id: 'b2',
  name: 'Madeira',
  storagePath: 'user/madeira.png',
};

const removed: BackgroundTemplate[] = [];

const fakeService: Pick<BackgroundTemplateService, 'list' | 'save' | 'remove'> = {
  list: async (): Promise<BackgroundTemplate[]> => [EXISTING],
  save: async (): Promise<BackgroundTemplate> => SAVED,
  remove: async (t: BackgroundTemplate): Promise<void> => {
    removed.push(t);
  },
};

const PNG = (): File => new File(['x'], 'madeira.png', { type: 'image/png' });

describe('BackgroundsManagerPage', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  function build(): BackgroundsManagerPage {
    TestBed.configureTestingModule({
      providers: [{ provide: BackgroundTemplateService, useValue: fakeService }],
    });
    const fixture = TestBed.createComponent(BackgroundsManagerPage);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('carrega os fundos existentes no ngOnInit', async () => {
    const cmp = build();
    await cmp.reload();
    expect(cmp.templates().length).toBe(1);
    expect(cmp.phase()).toBe('ready');
  });

  it('canSave exige nome e arquivo', () => {
    const cmp = build();
    expect(cmp.canSave()).toBe(false);
    cmp.name.set('Madeira');
    expect(cmp.canSave()).toBe(false);
    cmp.onFile(PNG());
    expect(cmp.canSave()).toBe(true);
  });

  it('save adiciona o novo fundo ao topo e limpa o formulário', async () => {
    const cmp = build();
    await cmp.reload();
    cmp.name.set('Madeira');
    cmp.onFile(PNG());

    await cmp.save();

    expect(cmp.templates()[0].id).toBe('b2');
    expect(cmp.templates().length).toBe(2);
    expect(cmp.name()).toBe('');
    expect(cmp.pendingFile()).toBeNull();
  });

  it('removeTemplate exclui após confirmação', async () => {
    removed.length = 0;
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const cmp = build();
    await cmp.reload();

    await cmp.removeTemplate(EXISTING);

    expect(removed).toContain(EXISTING);
    expect(cmp.templates().length).toBe(0);
  });

  it('removeTemplate não exclui quando o usuário cancela', async () => {
    removed.length = 0;
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
    const cmp = build();
    await cmp.reload();

    await cmp.removeTemplate(EXISTING);

    expect(removed.length).toBe(0);
    expect(cmp.templates().length).toBe(1);
  });
});
