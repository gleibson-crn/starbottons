import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

/**
 * OptionCard — item selecionável de um radiogroup (modelo ou tamanho).
 *
 * Renderiza `role="radio"` com `aria-checked`; a navegação por setas e o
 * roving tabindex ficam no radiogroup pai (WCAG 2.1.1). Cards indisponíveis
 * ("em breve") usam `aria-disabled` e não emitem seleção.
 */
@Component({
  selector: 'app-option-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './option-card.html',
  styleUrl: './option-card.scss',
  host: {
    role: 'radio',
    '[attr.aria-checked]': 'selected()',
    '[attr.aria-disabled]': 'disabled() ? true : null',
    '[attr.tabindex]': 'tabbable() ? 0 : -1',
    '[class.is-selected]': 'selected()',
    '[class.is-disabled]': 'disabled()',
    '(click)': 'activate()',
    '(keydown.enter)': 'activate($event)',
    '(keydown.space)': 'activate($event)',
  },
})
export class OptionCard {
  readonly label = input.required<string>();
  readonly description = input<string>('');
  readonly badge = input<string>('');
  readonly selected = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  /** Recebe o tabindex 0 dentro do grupo (roving). */
  readonly tabbable = input<boolean>(false);

  readonly activated = output<void>();

  activate(event?: Event): void {
    event?.preventDefault();
    if (!this.disabled()) {
      this.activated.emit();
    }
  }
}
