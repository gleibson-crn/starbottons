import { TestBed } from '@angular/core/testing';
import { APP_VERSION } from './app-version';
import { ModalService } from './modal';
import { LAST_SEEN_VERSION_KEY } from './update-notice.service';
import { DO_UPDATE_URL, UpdateService } from './update.service';

const modal = {
  showChoices: vi.fn(),
  showAlert: vi.fn().mockResolvedValue(undefined),
  showConfirm: vi.fn(),
};
const json = (body: unknown) => ({ ok: true, text: async () => JSON.stringify(body) });
const notFound = { ok: false, text: async () => '' };
const available = { latestVersion: '9.9.9', notes: ['Novo recurso'] };

class Testable extends UpdateService {
  closed = 0;
  protected override closeWindow(): void {
    this.closed++;
  }
}

function setup(fetchImpl: (url: string, init?: RequestInit) => unknown): Testable {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: string, i?: RequestInit) => fetchImpl(u, i)),
  );
  TestBed.configureTestingModule({
    providers: [{ provide: ModalService, useValue: modal }, Testable],
  });
  return TestBed.inject(Testable);
}

const fetchCalls = (): unknown[][] => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
  modal.showChoices.mockReset();
  modal.showAlert.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('UpdateService (B: nova versão disponível)', () => {
  it('disponível: mostra pop-up e, em "Atualizar agora", faz o POST e fecha', async () => {
    modal.showChoices.mockResolvedValue('now');
    const svc = setup((u) => (u === DO_UPDATE_URL ? json({ ok: true }) : json(available)));
    await svc.checkOnBoot();
    const opts = modal.showChoices.mock.calls[0][0];
    expect(opts.title).toBe('Nova versão disponível (v9.9.9)');
    expect(opts.message).toContain('Novo recurso');
    expect(opts.choices.map((c: { label: string }) => c.label)).toEqual([
      'Atualizar agora',
      'Depois',
    ]);
    const post = fetchCalls().find((c) => c[0] === DO_UPDATE_URL);
    expect(post?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ targetVersion: '9.9.9' }),
    });
    expect(svc.closed).toBe(1);
    expect(modal.showAlert.mock.calls[0][0].message).toContain('Feche esta janela');
  });

  it('indisponível (404): não mostra nada', async () => {
    const svc = setup(() => notFound);
    await svc.checkOnBoot();
    expect(modal.showChoices).not.toHaveBeenCalled();
  });

  it('SPA fallback (HTML): não mostra', async () => {
    const svc = setup(() => ({ ok: true, text: async () => '<!doctype html><html></html>' }));
    await svc.checkOnBoot();
    expect(modal.showChoices).not.toHaveBeenCalled();
  });

  it('versão não maior que a atual: não mostra', async () => {
    const svc = setup(() => json({ latestVersion: APP_VERSION, notes: [] }));
    await svc.checkOnBoot();
    expect(modal.showChoices).not.toHaveBeenCalled();
  });

  it('"Depois": não faz POST e não insiste na sessão', async () => {
    modal.showChoices.mockResolvedValue('later');
    const svc = setup(() => json(available));
    await svc.checkOnBoot();
    await svc.checkOnBoot();
    expect(modal.showChoices).toHaveBeenCalledTimes(1);
    expect(fetchCalls().map((c) => c[0])).not.toContain(DO_UPDATE_URL);
  });

  it('erro de rede no POST: alerta claro e não quebra', async () => {
    modal.showChoices.mockResolvedValue('now');
    const svc = setup((u) => {
      if (u === DO_UPDATE_URL) {
        throw new TypeError('Failed to fetch');
      }
      return json(available);
    });
    await expect(svc.checkOnBoot()).resolves.toBeUndefined();
    expect(modal.showAlert.mock.calls[0][0].message).toContain(
      'Não foi possível iniciar a atualização',
    );
    expect(svc.closed).toBe(0);
  });

  it('pop-up é não-descartável (não some por clique fora/Esc)', async () => {
    modal.showChoices.mockResolvedValue('later');
    const svc = setup(() => json(available));
    await svc.checkOnBoot();
    expect(modal.showChoices.mock.calls[0][0].dismissible).toBe(false);
  });

  it('botão do topo: available() liga e openDialog() reabre o pop-up', async () => {
    modal.showChoices.mockResolvedValue('later');
    const svc = setup(() => json(available));
    await svc.checkOnBoot();
    expect(svc.available()?.latestVersion).toBe('9.9.9'); // botão aparece no topo
    await svc.openDialog(); // clicar no botão reabre
    expect(modal.showChoices).toHaveBeenCalledTimes(2);
  });

  it('openDialog() sem atualização conhecida: no-op', async () => {
    const svc = setup(() => notFound);
    await svc.checkOnBoot();
    await svc.openDialog();
    expect(modal.showChoices).not.toHaveBeenCalled();
    expect(svc.available()).toBeNull();
  });
});

describe('UpdateNotice (A: atualizado) e exclusividade A x B', () => {
  it('pós-update: mostra "atualizado" 1x e grava a versão', async () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '0.9.0');
    const svc = setup(() => notFound);
    await svc.checkOnBoot();
    expect(modal.showAlert).toHaveBeenCalledTimes(1);
    expect(modal.showAlert.mock.calls[0][0].title).toBe('Star Bottons atualizado');
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe(APP_VERSION);
  });

  it('exclusividade: A mostrado => B (nem o fetch) não roda no mesmo boot', async () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '0.9.0');
    const svc = setup(() => json(available));
    await svc.checkOnBoot();
    expect(modal.showChoices).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('primeira instalação: grava em silêncio, sem aviso A', async () => {
    localStorage.clear();
    const svc = setup(() => notFound);
    await svc.checkOnBoot();
    expect(modal.showAlert).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe(APP_VERSION);
  });

  it('localStorage indisponível: não quebra', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const svc = setup(() => notFound);
    await expect(svc.checkOnBoot()).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('UpdateService — desktop (.exe via electron-updater)', () => {
  let installUpdate: ReturnType<typeof vi.fn>;
  let fire: ((info: { version: string }) => void) | null;
  const flush = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    installUpdate = vi.fn().mockResolvedValue(undefined);
    fire = null;
    (globalThis as unknown as { sb?: unknown }).sb = {
      onUpdateDownloaded: (cb: (info: { version: string }) => void) => {
        fire = cb;
      },
      installUpdate,
    };
  });
  afterEach(() => {
    delete (globalThis as unknown as { sb?: unknown }).sb;
  });

  it('ao baixar, avisa DENTRO do app (modal, não toast) e, em "Reiniciar", instala', async () => {
    modal.showChoices.mockResolvedValue('now');
    const svc = setup(() => notFound);
    svc.registerDesktop();
    expect(fire).toBeTypeOf('function');
    fire!({ version: '1.2.9' });
    await flush();
    const opts = modal.showChoices.mock.calls[0][0];
    expect(opts.title).toContain('1.2.9');
    expect(opts.dismissible).toBe(false);
    expect(installUpdate).toHaveBeenCalledTimes(1);
  });

  it('em "Depois", não instala agora (fica para o fechamento do app)', async () => {
    modal.showChoices.mockResolvedValue('later');
    const svc = setup(() => notFound);
    svc.registerDesktop();
    fire!({ version: '1.2.9' });
    await flush();
    expect(installUpdate).not.toHaveBeenCalled();
  });
});
