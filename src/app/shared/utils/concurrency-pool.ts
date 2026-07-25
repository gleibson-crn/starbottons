/**
 * Pool de concorrência puro (sem Angular). Executa `tasks` mantendo no máximo
 * `concurrency` promessas em voo. Cada tarefa é ISOLADA: uma falha vira um
 * resultado `rejected` (não derruba o pool). Respeita `AbortSignal` parando de
 * despachar novas tarefas — as já em voo terminam; as não despachadas viram
 * um resultado `rejected` com `PoolAbortedError`.
 *
 * Reusado pelo LOTE para gerar várias artes em paralelo e para baixar os bytes
 * do ZIP com paralelismo limitado.
 */

/** Erro atribuído às tarefas que não chegaram a ser despachadas por cancelamento. */
export class PoolAbortedError extends Error {
  constructor() {
    super('Tarefa cancelada antes de iniciar.');
    this.name = 'PoolAbortedError';
  }
}

export interface RunPoolOptions<T> {
  readonly concurrency: number;
  readonly signal?: AbortSignal;
  readonly onSettled?: (index: number, result: PromiseSettledResult<T>) => void;
}

async function settle<T>(task: () => Promise<T>): Promise<PromiseSettledResult<T>> {
  try {
    return { status: 'fulfilled', value: await task() };
  } catch (reason) {
    return { status: 'rejected', reason };
  }
}

export async function runPool<T>(
  tasks: readonly (() => Promise<T>)[],
  options: RunPoolOptions<T>,
): Promise<PromiseSettledResult<T>[]> {
  const results = new Array<PromiseSettledResult<T>>(tasks.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    for (let i = next++; i < tasks.length; i = next++) {
      if (options.signal?.aborted) {
        results[i] = { status: 'rejected', reason: new PoolAbortedError() };
        options.onSettled?.(i, results[i]);
        continue;
      }
      results[i] = await settle(tasks[i]);
      options.onSettled?.(i, results[i]);
    }
  };

  const lanes = Math.max(1, Math.min(options.concurrency, tasks.length || 1));
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return results;
}
