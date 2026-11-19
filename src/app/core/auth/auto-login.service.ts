import { inject, Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { LOCAL_USER } from './local-credentials';
import { localBackend } from '../local-backend/local-api';

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
    // DESKTOP (ADR-033): sem Supabase — o AuthService já entra com o usuário
    // local único no boot. Nada a fazer (não tenta signIn remoto).
    if (localBackend()) {
      return;
    }
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
