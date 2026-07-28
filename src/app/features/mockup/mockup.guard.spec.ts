import { runInInjectionContext, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { BatchStore, IDLE_ART, type BatchItem, type BottonSize } from '../../core/batch';
import { ToastService } from '../../shared/ui';
import { mockupGuard } from './mockup.guard';

const URL_TREE = { __urlTree: '/app/batch' } as unknown;

/** Item mínimo do lote com um mapa de status de artes por tamanho. */
function makeItem(id: string, arts: Partial<Record<BottonSize, 'ready' | 'failed' | 'idle'>>): BatchItem {
  const artMap: BatchItem['arts'] = {};
  for (const [size, status] of Object.entries(arts)) {
    (artMap as Record<number, unknown>)[Number(size)] = { ...IDLE_ART, status };
  }
  return { id, arts: artMap } as unknown as BatchItem;
}

function routeWith(itemId: string | null): ActivatedRouteSnapshot {
  return {
    paramMap: { get: (k: string) => (k === 'itemId' ? itemId : null) },
  } as unknown as ActivatedRouteSnapshot;
}

function run(items: BatchItem[], itemId: string | null, toast: { show: unknown }) {
  const store = { items: () => items } as Partial<BatchStore>;
  const router = { createUrlTree: () => URL_TREE } as unknown as Router;
  TestBed.configureTestingModule({
    providers: [
      { provide: BatchStore, useValue: store },
      { provide: Router, useValue: router },
      { provide: ToastService, useValue: toast },
    ],
  });
  const injector = TestBed.inject(Injector);
  return runInInjectionContext(injector, () =>
    (mockupGuard as unknown as (r: ActivatedRouteSnapshot) => unknown)(routeWith(itemId)),
  );
}

describe('mockupGuard (lote + rota)', () => {
  it('libera quando o item da rota tem ≥1 arte pronta', () => {
    const toast = { show: vi.fn() };
    const items = [makeItem('a', { 44: 'ready', 58: 'failed' })];
    expect(run(items, 'a', toast)).toBe(true);
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('bloqueia (redireciona a /app/batch + avisa) quando o item não existe', () => {
    const toast = { show: vi.fn() };
    const items = [makeItem('a', { 44: 'ready' })];
    expect(run(items, 'zzz', toast)).toBe(URL_TREE);
    expect(toast.show).toHaveBeenCalled();
  });

  it('bloqueia quando o item existe mas nenhuma arte está pronta', () => {
    const toast = { show: vi.fn() };
    const items = [makeItem('a', { 44: 'failed', 58: 'idle' })];
    expect(run(items, 'a', toast)).toBe(URL_TREE);
    expect(toast.show).toHaveBeenCalled();
  });

  it('bloqueia quando não há itemId na rota', () => {
    const toast = { show: vi.fn() };
    expect(run([], null, toast)).toBe(URL_TREE);
    expect(toast.show).toHaveBeenCalled();
  });
});
