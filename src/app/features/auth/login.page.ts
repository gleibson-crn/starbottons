import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth';

/**
 * LoginPage — autenticação por e-mail/senha (sem cadastro público).
 *
 * A11y: cada campo tem `<label>` associado e `aria-describedby` para erro;
 * a mensagem de falha vive numa região `role="alert"` (aria-live assertive).
 * O botão fica desabilitado durante o envio (estado `loading`).
 */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.signInWithPassword(email, password);
      await this.router.navigate(['/app/upload']);
    } catch {
      this.errorMessage.set('E-mail ou senha inválidos. Tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }
}
