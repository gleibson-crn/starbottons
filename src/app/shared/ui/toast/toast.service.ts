import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  readonly id: number;
  readonly kind: ToastKind;
  readonly text: string;
}

/** Fila de toasts global; a `ToastHost` renderiza numa região `aria-live`. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<readonly ToastMessage[]>([]);
  private seq = 0;

  show(kind: ToastKind, text: string, timeoutMs = 5000): number {
    const id = ++this.seq;
    this.toasts.update((list) => [...list, { id, kind, text }]);
    if (timeoutMs > 0) {
      setTimeout(() => this.dismiss(id), timeoutMs);
    }
    return id;
  }

  success(text: string): number {
    return this.show('success', text);
  }

  error(text: string): number {
    return this.show('error', text, 8000);
  }

  warning(text: string): number {
    return this.show('warning', text);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
