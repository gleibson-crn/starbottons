import { Injectable, signal } from '@angular/core';

export type ModalVariant = 'primary' | 'secondary' | 'danger';

export interface ModalChoice<T> {
  readonly value: T;
  readonly label: string;
  readonly variant: ModalVariant;
  readonly disabled?: boolean;
}

export interface ConfirmOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly danger?: boolean;
}

export interface AlertOptions {
  readonly title: string;
  readonly message: string;
}

export interface ChoicesOptions<T> {
  readonly title: string;
  readonly message?: string;
  readonly choices: readonly ModalChoice<T>[];
  /**
   * Quando `false`, Esc e clique no backdrop NÃO fecham — o usuário precisa
   * escolher um botão. Use em decisões que não podem sumir por engano (ex.: o
   * aviso de atualização). Padrão: `true`.
   */
  readonly dismissible?: boolean;
}

/** Modal ativo (forma única consumida pelo host). */
export interface ActiveModal {
  readonly title: string;
  readonly message: string;
  readonly choices: readonly ModalChoice<unknown>[];
  /** Valor devolvido por Esc / clique no backdrop. */
  readonly cancelValue: unknown;
  /** `false` = Esc/backdrop não fecham (exige escolher um botão). */
  readonly dismissible: boolean;
  readonly resolve: (value: unknown) => void;
}

/**
 * ModalService — diálogos do sistema (substitui `window.confirm/alert`).
 * Um modal ativo por vez; os demais aguardam numa fila FIFO. O
 * `<app-modal-host>` renderiza `active()` num `<dialog>` nativo.
 */
@Injectable({ providedIn: 'root' })
export class ModalService {
  private readonly queue: ActiveModal[] = [];
  private readonly activeSignal = signal<ActiveModal | null>(null);
  readonly active = this.activeSignal.asReadonly();

  showConfirm(opts: ConfirmOptions): Promise<boolean> {
    return this.enqueue<boolean>(opts.title, opts.message, false, true, [
      { value: false, label: opts.cancelLabel ?? 'Cancelar', variant: 'secondary' },
      {
        value: true,
        label: opts.confirmLabel ?? 'Confirmar',
        variant: opts.danger ? 'danger' : 'primary',
      },
    ]);
  }

  async showAlert(opts: AlertOptions): Promise<void> {
    await this.enqueue<boolean>(opts.title, opts.message, true, true, [
      { value: true, label: 'OK', variant: 'primary' },
    ]);
  }

  /** Resolve o `value` escolhido, ou `null` se cancelado (Esc/backdrop). */
  showChoices<T>(opts: ChoicesOptions<T>): Promise<T | null> {
    return this.enqueue<T | null>(
      opts.title,
      opts.message ?? '',
      null,
      opts.dismissible ?? true,
      opts.choices,
    );
  }

  /** Chamado pelo host: resolve o modal ativo e avança a fila. */
  close(value: unknown): void {
    const current = this.activeSignal();
    if (!current) {
      return;
    }
    this.activeSignal.set(this.queue.shift() ?? null);
    current.resolve(value);
  }

  private enqueue<R>(
    title: string,
    message: string,
    cancelValue: unknown,
    dismissible: boolean,
    choices: readonly ModalChoice<unknown>[],
  ): Promise<R> {
    return new Promise<R>((resolve) => {
      const modal: ActiveModal = {
        title,
        message,
        choices,
        cancelValue,
        dismissible,
        resolve: resolve as (v: unknown) => void,
      };
      if (this.activeSignal()) {
        this.queue.push(modal);
      } else {
        this.activeSignal.set(modal);
      }
    });
  }
}
