import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { ModalService } from './modal.service';

/**
 * ModalHost — renderiza o modal ativo num `<dialog>` nativo (`showModal()`:
 * focus-trap, Esc e aria-modal de graça). Esc e clique no backdrop cancelam.
 * O foco inicial vai ao último botão NÃO destrutivo (nunca o "danger") e é
 * devolvido ao elemento que abriu o modal ao fechar.
 */
@Component({
  selector: 'app-modal-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modal-host.html',
  styleUrl: './modal-host.scss',
})
export class ModalHost {
  private readonly service = inject(ModalService);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dlg');
  private opener: HTMLElement | null = null;
  private bound: HTMLDialogElement | null = null;

  readonly modal = this.service.active;

  constructor() {
    effect(() => {
      const current = this.modal();
      const dlg = this.dialog()?.nativeElement;
      if (current && dlg && !dlg.open) {
        this.opener ??= document.activeElement as HTMLElement | null;
        this.open(dlg);
      }
    });
  }

  choose(value: unknown): void {
    this.finish(value);
  }

  /** Esc (evento `cancel` do dialog) e clique no backdrop. */
  cancel(event: Event): void {
    event.preventDefault(); // Esc nunca fecha o <dialog> por conta própria
    const current = this.modal();
    // Modal não-descartável: Esc/backdrop são ignorados (exige escolher um botão).
    if (current && current.dismissible) {
      this.finish(current.cancelValue);
    }
  }

  onDialogClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancel(event);
    }
  }

  private open(dlg: HTMLDialogElement): void {
    // Clique no próprio <dialog> (fora da caixa) = backdrop. Ouvinte via DOM:
    // o <dialog> já é focável/operável por teclado (Esc), então não é uma
    // interação só-de-mouse.
    if (this.bound !== dlg) {
      dlg.addEventListener('click', (e) => this.onDialogClick(e));
      this.bound = dlg;
    }
    dlg.showModal();
    this.safeButton(dlg)?.focus();
  }

  private safeButton(dlg: HTMLDialogElement): HTMLButtonElement | undefined {
    const safe = Array.from(
      dlg.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not(.btn--danger)'),
    );
    return (
      safe.at(-1) ?? dlg.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? undefined
    );
  }

  private finish(value: unknown): void {
    const dlg = this.dialog()?.nativeElement;
    if (dlg?.open) {
      dlg.close();
    }
    const opener = this.opener;
    this.opener = null;
    this.service.close(value);
    if (opener?.isConnected) {
      opener.focus();
    }
  }
}
