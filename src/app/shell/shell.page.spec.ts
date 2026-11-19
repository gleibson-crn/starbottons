/**
 * ShellPage — menu superior global (navegação principal) + proteção do lote.
 *
 * Garante que os links levam às rotas certas, que a rota ativa recebe
 * `aria-current="page"`, e que "Botton" NUNCA apaga o lote em silêncio: com
 * lote em andamento abre o diálogo de decisão (imprimir/ZIP/editar/apagar).
 */
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthService } from '../core/auth';
import { BatchStore } from '../core/batch';
import { ModalService, ToastService } from '../shared/ui';
import { ShellPage } from './shell.page';

@Component({ selector: 'app-stub', template: 'stub' })
class Stub {}

const routes = [
  {
    path: 'app',
    component: ShellPage,
    children: [
      { path: 'upload', component: Stub },
      { path: 'impressao', component: Stub, data: { print: true } },
      { path: 'mockups', component: Stub, data: { manage: true } },
      { path: 'batch', component: Stub, data: { batch: true } },
      { path: '', pathMatch: 'full' as const, redirectTo: 'upload' },
    ],
  },
];

const batchFake = {
  items: signal<unknown[]>([]),
  hasWork: signal(false),
  artesProntas: signal(0),
  savedToZip: signal(false),
  reset: vi.fn(),
  loadResumable: vi.fn().mockResolvedValue(null),
  restore: vi.fn().mockResolvedValue(undefined),
  clearPersisted: vi.fn().mockResolvedValue(undefined),
  flushPersist: vi.fn(),
  exportZip: vi.fn(),
};
const authFake = { signOut: vi.fn().mockResolvedValue(undefined) };
const modalFake = { showChoices: vi.fn(), showConfirm: vi.fn(), showAlert: vi.fn() };

function setWork(n: number, ready = 0): void {
  batchFake.items.set(Array.from({ length: n }));
  batchFake.hasWork.set(n > 0);
  batchFake.artesProntas.set(ready);
}

async function renderAt(url: string): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      { provide: AuthService, useValue: authFake },
      { provide: BatchStore, useValue: batchFake },
      { provide: ModalService, useValue: modalFake },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  const harness = await RouterTestingHarness.create(url);
  harness.detectChanges();
  return harness.fixture.nativeElement as HTMLElement;
}

function links(root: HTMLElement): HTMLAnchorElement[] {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>('.shell__nav-link'));
}

beforeEach(() => {
  setWork(0);
  batchFake.savedToZip.set(false);
  batchFake.reset.mockReset();
  batchFake.exportZip.mockReset();
  modalFake.showChoices.mockReset();
  modalFake.showConfirm.mockReset();
  modalFake.showAlert.mockReset();
});

describe('ShellPage — menu superior', () => {
  it('renderiza a nav rotulada com os links esperados', async () => {
    const root = await renderAt('/app/upload');
    const nav = root.querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('Navegação principal');
    const labels = links(root).map((a) => a.textContent?.trim());
    expect(labels).toEqual([
      'Botton',
      'Impressão',
      'Curadoria de mockups',
      'Curadoria de fundos',
      'Curadoria de molduras',
    ]);
  });

  it('marca aria-current="page" no link de Upload quando ativo', async () => {
    const [upload, , mockups] = links(await renderAt('/app/upload'));
    expect(upload.getAttribute('aria-current')).toBe('page');
    expect(mockups.getAttribute('aria-current')).toBeNull();
  });

  it('marca aria-current="page" na Curadoria quando ativa', async () => {
    const [upload, , mockups] = links(await renderAt('/app/mockups'));
    expect(mockups.getAttribute('aria-current')).toBe('page');
    expect(upload.getAttribute('aria-current')).toBeNull();
  });

  it('não destaca nenhum item em rota fora do menu (ex.: lote sem trabalho)', async () => {
    const marked = links(await renderAt('/app/batch')).filter(
      (a) => a.getAttribute('aria-current') === 'page',
    );
    expect(marked).toHaveLength(0);
  });
});

describe('ShellPage — link "Bottons (N)"', () => {
  it('não aparece sem lote', async () => {
    const root = await renderAt('/app/mockups');
    expect(links(root).some((a) => a.textContent?.includes('Bottons ('))).toBe(false);
  });

  it('com lote mostra "Bottons (N)" para /app/batch e marca aria-current nele', async () => {
    setWork(4, 0);
    const link = links(await renderAt('/app/batch'))[1];
    expect(link.textContent?.trim()).toBe('Bottons (4)');
    expect(link.getAttribute('href')).toBe('/app/batch');
    expect(link.getAttribute('aria-current')).toBe('page');
  });
});

describe('ShellPage — proteção do lote (Botton)', () => {
  async function clickBotton(root: HTMLElement): Promise<string> {
    links(root)[0].click();
    await new Promise((r) => setTimeout(r, 0));
    return TestBed.inject(Router).url;
  }

  it('sem lote: vai direto ao upload, sem modal', async () => {
    const url = await clickBotton(await renderAt('/app/mockups'));
    expect(modalFake.showChoices).not.toHaveBeenCalled();
    expect(url).toBe('/app/upload');
  });

  it('com lote: abre o diálogo com contagem e NÃO navega nem apaga', async () => {
    setWork(3, 2);
    modalFake.showChoices.mockResolvedValue(null);
    const url = await clickBotton(await renderAt('/app/mockups'));
    const arg = modalFake.showChoices.mock.calls[0][0];
    expect(arg.title).toBe('Você tem 3 bottons (2 prontos)');
    expect(arg.choices.map((c: { value: string }) => c.value)).toEqual([
      'print',
      'zip',
      'edit',
      'clear',
    ]);
    expect(batchFake.reset).not.toHaveBeenCalled();
    expect(url).toBe('/app/mockups');
  });

  it('opção ZIP só aparece com artes prontas', async () => {
    setWork(1, 0);
    modalFake.showChoices.mockResolvedValue(null);
    await clickBotton(await renderAt('/app/mockups'));
    const values = modalFake.showChoices.mock.calls[0][0].choices.map(
      (c: { value: string }) => c.value,
    );
    expect(values).toEqual(['print', 'edit', 'clear']);
  });

  it('print → /app/impressao', async () => {
    setWork(1, 1);
    modalFake.showChoices.mockResolvedValueOnce('print');
    expect(await clickBotton(await renderAt('/app/mockups'))).toBe('/app/impressao');
  });

  it('edit → /app/batch', async () => {
    setWork(1, 1);
    modalFake.showChoices.mockResolvedValueOnce('edit');
    expect(await clickBotton(await renderAt('/app/mockups'))).toBe('/app/batch');
  });

  it('zip exporta e reabre o diálogo', async () => {
    setWork(1, 1);
    batchFake.exportZip.mockResolvedValue({ zipped: 1, skippedFailures: 0 });
    modalFake.showChoices.mockResolvedValueOnce('zip').mockResolvedValueOnce(null);
    await clickBotton(await renderAt('/app/mockups'));
    expect(batchFake.exportZip).toHaveBeenCalledTimes(1);
    expect(modalFake.showChoices).toHaveBeenCalledTimes(2);
  });

  it('clear com artes prontas não salvas pede confirmação; cancelar NÃO apaga', async () => {
    setWork(22, 22);
    modalFake.showChoices.mockResolvedValue('clear');
    modalFake.showConfirm.mockResolvedValue(false);
    await clickBotton(await renderAt('/app/mockups'));
    expect(modalFake.showConfirm.mock.calls[0][0]).toMatchObject({
      danger: true,
      message: 'Isso apaga 22 bottons. Continuar?',
    });
    expect(batchFake.reset).not.toHaveBeenCalled();
  });

  it('clear confirmado → reset + /app/upload', async () => {
    setWork(2, 2);
    modalFake.showChoices.mockResolvedValue('clear');
    modalFake.showConfirm.mockResolvedValue(true);
    const url = await clickBotton(await renderAt('/app/mockups'));
    expect(batchFake.reset).toHaveBeenCalledTimes(1);
    expect(url).toBe('/app/upload');
  });

  it('clear com ZIP já salvo não pede confirmação extra', async () => {
    setWork(2, 2);
    batchFake.savedToZip.set(true);
    modalFake.showChoices.mockResolvedValue('clear');
    await clickBotton(await renderAt('/app/mockups'));
    expect(modalFake.showConfirm).not.toHaveBeenCalled();
    expect(batchFake.reset).toHaveBeenCalledTimes(1);
  });

  it('beforeunload avisa só quando há lote', async () => {
    await renderAt('/app/mockups');
    const fire = (): boolean => {
      const ev = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(fire()).toBe(false);
    setWork(1);
    expect(fire()).toBe(true);
  });
});

describe('ShellPage - retomar lote (BL-008)', () => {
  const snap = {
    v: 1,
    batchId: 'b',
    savedAt: 1,
    userId: 'u',
    items: [{ arts: { 32: { status: 'ready', jobId: 'j' } } }, { arts: {} }],
  };

  beforeEach(() => {
    batchFake.loadResumable.mockReset();
    batchFake.restore.mockClear();
    batchFake.clearPersisted.mockClear();
  });

  it('sem snapshot nao pergunta nada', async () => {
    batchFake.loadResumable.mockResolvedValue(null);
    await renderAt('/app/upload');
    expect(modalFake.showChoices).not.toHaveBeenCalled();
  });

  it('Retomar chama restore e pergunta com o resumo', async () => {
    batchFake.loadResumable.mockResolvedValue(snap);
    modalFake.showChoices.mockResolvedValue('restore');
    await renderAt('/app/upload');
    await vi.waitFor(() => expect(batchFake.restore).toHaveBeenCalledWith(snap));
    const arg = modalFake.showChoices.mock.calls[0][0];
    expect(arg.title).toBe('Retomar o último lote?');
    expect(arg.message).toBe('2 bottons, 1 pronto');
  });

  it('Descartar limpa o persistido sem restaurar', async () => {
    batchFake.loadResumable.mockResolvedValue(snap);
    modalFake.showChoices.mockResolvedValue('discard');
    await renderAt('/app/upload');
    await vi.waitFor(() => expect(batchFake.clearPersisted).toHaveBeenCalled());
    expect(batchFake.restore).not.toHaveBeenCalled();
  });
});

describe('ShellPage - Sair (app desktop)', () => {
  function sairButton(root: HTMLElement): HTMLButtonElement {
    return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Sair'),
    ) as HTMLButtonElement;
  }

  afterEach(() => vi.restoreAllMocks());

  it('Sair fecha na hora: POST /quit + window.close, sem pop-up nem signOut', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => '{}' });
    vi.stubGlobal('fetch', fetchSpy);
    sairButton(await renderAt('/app/upload')).click();
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:4299/quit', { method: 'POST' });
    expect(modalFake.showConfirm).not.toHaveBeenCalled();
    expect(modalFake.showAlert).not.toHaveBeenCalled();
    expect(authFake.signOut).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('Sair funciona mesmo se o /quit falhar (cai no window.close)', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sem servidor')));
    sairButton(await renderAt('/app/upload')).click();
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    vi.unstubAllGlobals();
  });
});
