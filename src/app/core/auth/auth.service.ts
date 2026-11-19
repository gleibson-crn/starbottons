import { inject, Injectable, signal } from '@angular/core';
import type { Session, User } from '@supabase/supabase-js';
import { SupabaseClientService } from '../supabase/supabase-client.service';
import { localBackend } from '../local-backend/local-api';
import { LOCAL_USER } from './local-credentials';

/**
 * Usuário sintético do modo DESKTOP (Electron): o app é local-only, de usuário
 * único, SEM login (ADR-033). Não há Supabase; este objeto só satisfaz o tipo
 * `User` para quem lê `auth.user()` — nenhuma escrita remota o usa.
 */
const LOCAL_SESSION_USER = {
  id: 'local-user',
  email: LOCAL_USER.email,
  app_metadata: {},
  user_metadata: {},
  aud: 'local',
  created_at: '',
} as unknown as User;

/**
 * Serviço de autenticação (fachada sobre o Supabase Auth).
 *
 * No bootstrap expõe apenas o estado da sessão como signals e helpers de
 * login/logout. A UI de auth (feature `auth`) será construída depois; este
 * serviço garante um estado default seguro (deslogado) desde o início.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseClientService).client;

  /** Sessão atual do Supabase, ou `null` quando deslogado (default). */
  readonly session = signal<Session | null>(null);

  /** Usuário atual derivado da sessão, ou `null`. */
  readonly user = signal<User | null>(null);

  /** Resolve quando a sessão inicial foi lida do storage (evita corrida do guard). */
  private readonly hydrated: Promise<void>;

  /** Backend local (Electron): quando presente, o app roda SEM login. */
  private readonly local = localBackend();

  constructor() {
    // DESKTOP (ADR-033): sem Supabase, sem login. Autentica já com o usuário
    // local único e não escuta mudanças de sessão remotas.
    if (this.local) {
      this.applySession({ user: LOCAL_SESSION_USER } as unknown as Session);
      this.hydrated = Promise.resolve();
      return;
    }
    this.hydrated = this.hydrate();
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.applySession(session);
    });
  }

  /**
   * Aguarda a reidratação inicial da sessão. O guard deve `await` isto antes de
   * decidir: num reload/acesso direto a uma rota protegida, `getSession()` é
   * assíncrono e a sessão do storage ainda não estaria aplicada.
   */
  async ensureHydrated(): Promise<void> {
    await this.hydrated;
  }

  /** Retorna `true` se há uma sessão ativa. */
  isAuthenticated(): boolean {
    return this.session() !== null;
  }

  /** Login por e-mail/senha. */
  async signInWithPassword(email: string, password: string): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw error;
    }
    this.applySession(data.session);
  }

  /** Encerra a sessão atual. */
  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) {
      throw error;
    }
    this.applySession(null);
  }

  private async hydrate(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    this.applySession(data.session);
  }

  private applySession(session: Session | null): void {
    this.session.set(session);
    this.user.set(session?.user ?? null);
  }
}
