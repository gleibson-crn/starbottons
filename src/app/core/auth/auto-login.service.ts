import { inject, Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { LOCAL_USER } from './local-credentials';

/**
 * Login invisível: no boot, se não há sessão, entra com o usuário fixo local.
 * Roda uma única vez (APP_INITIALIZER) e NUNCA lança — em falha expõe
 * `failed` e o guard leva à tela de login existente (sem loop: /auth não
 * tem guard e o auto-login não é repetido).
 */
@Injectable({ providedIn: 'root' })
export class AutoLoginService {
  private readonly auth = inject(AuthService);

  /** `true` quando o auto-login foi tentado e falhou. */
  readonly failed = signal(false);

  async run(): Promise<void> {
    await this.auth.ensureHydrated();
    if (this.auth.isAuthenticated()) {
      return;
    }
    try {
      await this.auth.signInWithPassword(LOCAL_USER.email, LOCAL_USER.password);
    } catch {
      this.failed.set(true);
    }
  }
}
