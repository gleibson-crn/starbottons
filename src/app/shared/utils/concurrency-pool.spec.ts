import { PoolAbortedError, runPool } from './concurrency-pool';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Tarefa que registra concorrência viva e resolve no próximo tick. */
function tracked(state: { active: number; peak: number }, value: number) {
  return async (): Promise<number> => {
    state.active++;
    state.peak = Math.max(state.peak, state.active);
    await tick();
    state.active--;
    return value;
  };
}

describe('runPool', () => {
  it('respeita o teto de concorrência (nunca mais que N em voo)', async () => {
    const state = { active: 0, peak: 0 };
    const tasks = Array.from({ length: 10 }, (_, i) => tracked(state, i));

    const results = await runPool(tasks, { concurrency: 3 });

    expect(state.peak).toBe(3);
    expect(results).toHaveLength(10);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('isola falhas: 1 tarefa rejeitada não derruba as demais', async () => {
    const tasks = [
      () => Promise.resolve('a'),
      () => Promise.reject(new Error('boom')),
      () => Promise.resolve('c'),
    ];

    const results = await runPool(tasks, { concurrency: 2 });

    expect(results[0]).toEqual({ status: 'fulfilled', value: 'a' });
    expect(results[1].status).toBe('rejected');
    expect(results[2]).toEqual({ status: 'fulfilled', value: 'c' });
  });

  it('chama onSettled uma vez por tarefa com o índice correto', async () => {
    const seen: number[] = [];
    const tasks = [() => Promise.resolve(1), () => Promise.resolve(2)];

    await runPool(tasks, {
      concurrency: 1,
      onSettled: (i) => seen.push(i),
    });

    expect(seen.sort()).toEqual([0, 1]);
  });

  it('cancelamento: para de despachar e marca as pendentes como PoolAbortedError', async () => {
    const controller = new AbortController();
    let started = 0;
    const tasks = Array.from({ length: 6 }, () => async () => {
      started++;
      if (started === 2) {
        controller.abort();
      }
      await tick();
      return started;
    });

    const results = await runPool(tasks, {
      concurrency: 1,
      signal: controller.signal,
    });

    const aborted = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof PoolAbortedError,
    );
    expect(aborted.length).toBeGreaterThan(0);
    expect(started).toBeLessThan(tasks.length);
  });
});
