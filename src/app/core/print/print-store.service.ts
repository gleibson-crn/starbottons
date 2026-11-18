import { Injectable, signal } from '@angular/core';
import { clampQty, type SheetLine } from './sheet-line';

/**
 * PrintStore — fila (singleton) das artes destinadas à folha de impressão.
 * Começa VAZIA: abrir "Impressão" pelo menu mostra a folha em branco; as artes
 * do lote entram só via `enqueue` (botão "Levar para impressão" no cartão) e a
 * fila NÃO é auto-limpa ao navegar. `enqueue` SOMA a quantidade quando a mesma
 * `key` já está na fila (reusa `mergeReadyLine`). As URLs das linhas são object
 * URLs (`blob:`) de mesma origem; a store os REVOGA ao `remove`/`clear` para
 * não vazar memória (a fila sobrevive à página, então a revogação não pode
 * ficar presa ao ciclo de vida do componente).
 */
@Injectable({ providedIn: 'root' })
export class PrintStore {
  private readonly _queue = signal<SheetLine[]>([]);

  /** Fila atual (somente leitura) — fonte da folha na página de impressão. */
  readonly queue = this._queue.asReadonly();

  /** `true` se a `key` já está na fila (p/ o cartão refletir "adicionado"). */
  has(key: string): boolean {
    return this._queue().some((l) => l.key === key);
  }

  /**
   * Enfileira uma arte. Se a mesma `key` já existir, SOMA a quantidade (teto
   * 999) preservando a linha original — inclusive o object URL já enfileirado —
   * e revoga o object URL que veio na `line` (blob recém-criado) para não vazar.
   * Se for nova, entra como está (preservando `origin`: 'ready' ou 'avulso').
   */
  enqueue(line: SheetLine): void {
    const dup = this._queue().some((l) => l.key === line.key);
    if (dup) {
      revokeIfBlob(line.url);
      this._queue.update((lines) =>
        lines.map((l) =>
          l.key === line.key
            ? { ...l, quantity: clampQty(l.quantity + line.quantity) }
            : l,
        ),
      );
      return;
    }
    this._queue.update((lines) => [...lines, line]);
  }

  /** Remove uma linha da fila, revogando seu object URL (`blob:`). */
  remove(key: string): void {
    this._queue.update((lines) => {
      const target = lines.find((l) => l.key === key);
      revokeIfBlob(target?.url);
      return lines.filter((l) => l.key !== key);
    });
  }

  /** Esvazia a fila, revogando os object URLs de todas as linhas. */
  clear(): void {
    for (const line of this._queue()) {
      revokeIfBlob(line.url);
    }
    this._queue.set([]);
  }

  /** Redefine a quantidade de uma linha já na fila (limitada em 1..999). */
  setQuantity(key: string, quantity: number): void {
    const qty = clampQty(quantity);
    this._queue.update((lines) =>
      lines.map((l) => (l.key === key ? { ...l, quantity: qty } : l)),
    );
  }
}

/** Revoga um object URL só quando for `blob:` (ignora null/URLs remotas). */
function revokeIfBlob(url: string | undefined): void {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}
