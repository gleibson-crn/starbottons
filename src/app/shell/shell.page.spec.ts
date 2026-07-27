/**
 * ShellPage — menu superior global (navegação principal).
 *
 * Garante que os dois links levam às rotas certas e que a rota ativa recebe
 * `aria-current="page"` (via `routerLinkActive`). O rótulo contextual continua
 * condicionado por `data.batch/manage/contextual`.
 */
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthService } from '../core/auth';
import { ShellPage } from './shell.page';

@Component({ selector: 'app-stub', template: 'stub' })
class Stub {}

const routes = [
  {
    path: 'app',
    component: ShellPage,
    children: [
      { path: 'upload', component: Stub },
      { path: 'mockups', component: Stub, data: { manage: true } },
      { path: 'batch', component: Stub, data: { batch: true } },
      { path: '', pathMatch: 'full' as const, redirectTo: 'upload' },
    ],
  },
];

async function renderAt(url: string): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      { provide: AuthService, useValue: { signOut: vi.fn().mockResolvedValue(undefined) } },
    ],
  });
  const harness = await RouterTestingHarness.create(url);
  harness.detectChanges();
  return harness.fixture.nativeElement as HTMLElement;
}

function links(root: HTMLElement): HTMLAnchorElement[] {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>('.shell__nav-link'));
}

describe('ShellPage — menu superior', () => {
  it('renderiza a nav rotulada com os dois links esperados', async () => {
    const root = await renderAt('/app/upload');
    const nav = root.querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('Navegação principal');
    const labels = links(root).map((a) => a.textContent?.trim());
    expect(labels).toEqual(['Novo botton', 'Curadoria de mockups']);
  });

  it('marca aria-current="page" no link de Upload quando ativo', async () => {
    const [upload, mockups] = links(await renderAt('/app/upload'));
    expect(upload.getAttribute('aria-current')).toBe('page');
    expect(mockups.getAttribute('aria-current')).toBeNull();
  });

  it('marca aria-current="page" na Curadoria quando ativa', async () => {
    const [upload, mockups] = links(await renderAt('/app/mockups'));
    expect(mockups.getAttribute('aria-current')).toBe('page');
    expect(upload.getAttribute('aria-current')).toBeNull();
  });

  it('não destaca nenhum item em rota fora do menu (ex.: lote)', async () => {
    const marked = links(await renderAt('/app/batch')).filter(
      (a) => a.getAttribute('aria-current') === 'page',
    );
    expect(marked).toHaveLength(0);
  });
});
