/**
 * BatchProgress — a barra reflete artes RESOLVIDAS (prontas + falhas), então
 * ela enche (100%) quando o processamento termina mesmo com falhas, em vez de
 * travar em 86%. Os contadores continuam separando prontas × falhas.
 */
import { TestBed } from '@angular/core/testing';
import { BatchProgress } from './batch-progress';

function make(inputs: {
  total: number;
  ready?: number;
  generating?: number;
  failed?: number;
}): BatchProgress {
  const fixture = TestBed.createComponent(BatchProgress);
  const ref = fixture.componentRef;
  ref.setInput('total', inputs.total);
  ref.setInput('ready', inputs.ready ?? 0);
  ref.setInput('generating', inputs.generating ?? 0);
  ref.setInput('failed', inputs.failed ?? 0);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('BatchProgress — percent conta as falhas', () => {
  it('12 prontas + 2 falhas de 14 → 100% (barra cheia)', () => {
    const cmp = make({ total: 14, ready: 12, failed: 2 });
    expect(cmp.percent()).toBe(100);
  });

  it('sem falhas: 12 de 14 prontas → 86%', () => {
    const cmp = make({ total: 14, ready: 12, failed: 0 });
    expect(cmp.percent()).toBe(86);
  });

  it('em andamento: 6 prontas + 1 falha de 14 → 50%', () => {
    const cmp = make({ total: 14, ready: 6, generating: 7, failed: 1 });
    expect(cmp.percent()).toBe(50);
  });

  it('total 0 → 0% (sem divisão por zero)', () => {
    const cmp = make({ total: 0 });
    expect(cmp.percent()).toBe(0);
  });

  it('variante warning quando há falhas; success quando tudo pronto', () => {
    expect(make({ total: 14, ready: 12, failed: 2 }).variant()).toBe('warning');
    expect(make({ total: 3, ready: 3 }).variant()).toBe('success');
    expect(make({ total: 3, ready: 1, generating: 2 }).variant()).toBe('neutral');
  });
});
