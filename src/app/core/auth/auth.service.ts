import { inject, Injectable, signal } from '@angular/core';
import type { Session, User } from '@supabase/supabase-js';
import { SupabaseClientService } from '../supabase/supabase-client.service';

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

  constructor() {
    void this.hydrate();
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.applySession(session);
    });
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
