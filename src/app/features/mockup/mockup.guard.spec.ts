import { runInInjectionContext, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { WorkflowStore } from '../../core/workflow';
import { ToastService } from '../../shared/ui';
import { mockupGuard } from './mockup.guard';

const URL_TREE = { __urlTree: '/app/upload' } as unknown;

function makeStore(upload: boolean, selection: boolean): Partial<WorkflowStore> {
  return { hasUpload: () => upload, hasSelection: () => selection } as Partial<WorkflowStore>;
}

function run(store: Partial<WorkflowStore>, toast: { show: unknown }) {
  const router = { createUrlTree: () => URL_TREE } as unknown as Router;
  TestBed.configureTestingModule({
    providers: [
      { provide: WorkflowStore, useValue: store },
      { provide: Router, useValue: router },
      { provide: ToastService, useValue: toast },
    ],
  });
  const injector = TestBed.inject(Injector);
  return runInInjectionContext(injector, () =>
    (mockupGuard as unknown as () => unknown)(),
  );
}

describe('mockupGuard (não-regressão)', () => {
  it('libera quando há upload E seleção em memória', () => {
    const toast = { show: vi.fn() };
    const result = run(makeStore(true, true), toast);
    expect(result).toBe(true);
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('bloqueia (redireciona + avisa) sem upload', () => {
    const toast = { show: vi.fn() };
    const result = run(makeStore(false, true), toast);
    expect(result).toBe(URL_TREE);
    expect(toast.show).toHaveBeenCalled();
  });

  it('bloqueia sem seleção de tamanho', () => {
    const toast = { show: vi.fn() };
    const result = run(makeStore(true, false), toast);
    expect(result).toBe(URL_TREE);
    expect(toast.show).toHaveBeenCalled();
  });
});
