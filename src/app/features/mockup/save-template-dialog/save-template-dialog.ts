import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

/**
 * SaveTemplateDialog — modal para nomear e salvar a cena como template.
 * Acessibilidade: `role="dialog"` + `aria-modal`, Esc fecha, foco preso no
 * diálogo (Tab cicla), foco inicial no campo de nome. Nome é obrigatório; um
 * aviso leve de direito de imagem (fotos podem conter pessoas) exige confirmação.
 */
@Component({
  selector: 'app-save-template-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  host: { '(keydown)': 'onKeydown($event)' },
  templateUrl: './save-template-dialog.html',
  styleUrl: './save-template-dialog.scss',
})
export class SaveTemplateDialog implements AfterViewInit {
  readonly busy = input<boolean>(false);
  readonly saved = output<string>();
  readonly closed = output<void>();

  readonly name = signal('');
  readonly rightsConfirmed = signal(false);
  readonly touched = signal(false);

  private readonly dialogRef = viewChild<ElementRef<HTMLElement>>('dialog');
  private readonly nameRef = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  ngAfterViewInit(): void {
    this.nameRef()?.nativeElement.focus();
  }

  get canSave(): boolean {
    return this.name().trim().length > 0 && this.rightsConfirmed() && !this.busy();
  }

  onName(value: string): void {
    this.name.set(value);
  }

  onRights(checked: boolean): void {
    this.rightsConfirmed.set(checked);
  }

  submit(): void {
    this.touched.set(true);
    if (!this.canSave) {
      return;
    }
    this.saved.emit(this.name().trim());
  }

  close(): void {
    this.closed.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  /** Mantém o foco dentro do diálogo (WCAG 2.4.3 / 2.1.2 — sem escapar). */
  private trapFocus(event: KeyboardEvent): void {
    const focusables = this.focusable();
    if (focusables.length === 0) {
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusable(): HTMLElement[] {
    const root = this.dialogRef()?.nativeElement;
    if (!root) {
      return [];
    }
    const nodes = root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    return Array.from(nodes).filter((el) => !el.hasAttribute('disabled'));
  }
}
