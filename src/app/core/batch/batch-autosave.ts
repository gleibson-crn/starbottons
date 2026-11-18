/** Debounce simples (setTimeout) com `cancel` — usado na gravação do snapshot. */
export interface Debouncer {
  schedule(): void;
  cancel(): void;
}

export function createDebouncer(run: () => void, ms: number): Debouncer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return {
    cancel,
    schedule: (): void => {
      cancel();
      timer = setTimeout(run, ms);
    },
  };
}
