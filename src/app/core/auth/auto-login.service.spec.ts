/**
 * Login invisível: sessão existente não re-loga; sem sessão loga com o usuário
 * fixo local; falha não lança (marca `failed`) e o guard cai em /auth sem loop.
 */
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AutoLoginService } from './auto-login.service';
import { LOCAL_USER } from './local-credentials';

function makeAuth(initial: boolean, signIn: () => Promise<void>) {
  let has = initial;
  return {
    ensureHydrated: vi.fn().mockResolvedValue(undefined),
    isAuthenticated: () => has,
    signInWithPassword: vi.fn(async (e: string, p: string) => {
      await signIn();
      has = true;
      return void [e, p];
    }),
  };
}

function setup(auth: ReturnType<typeof makeAuth>): AutoLoginService {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
  });
  return TestBed.inject(AutoLoginService);
}

describe('AutoLoginService', () => {
  it('com sessão existente NÃO re-loga', async () => {
    const auth = makeAuth(true, async () => undefined);
    const svc = setup(auth);
    await svc.run();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(svc.failed()).toBe(false);
  });

  it('sem sessão loga com o usuário fixo local e o guard libera /app', async () => {
    const auth = makeAuth(false, async () => undefined);
    const svc = setup(auth);
    await svc.run();
    expect(auth.signInWithPassword).toHaveBeenCalledWith(LOCAL_USER.email, LOCAL_USER.password);
    expect(svc.failed()).toBe(false);
    const result = await TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(result).toBe(true);
  });

  it('falha do auto-login não lança, marca failed e o guard manda p/ /auth (uma vez, sem loop)', async () => {
    const auth = makeAuth(false, () => Promise.reject(new Error('down')));
    const svc = setup(auth);
    await expect(svc.run()).resolves.toBeUndefined();
    expect(svc.failed()).toBe(true);
    expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);
    const result = await TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(TestBed.inject(Router).serializeUrl(result as never)).toBe('/auth');
    expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);
  });
});
