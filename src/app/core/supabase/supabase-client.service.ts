import { inject, Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { APP_CONFIG } from '../config/app-config';

/**
 * Provedor único do cliente Supabase (Postgres / Auth / Storage / Edge).
 *
 * Lê `supabaseUrl` / `supabaseAnonKey` do environment via APP_CONFIG.
 * É `providedIn: 'root'` para garantir uma única instância (singleton) —
 * múltiplos clientes GoTrue no mesmo browser causam avisos de sessão.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseClientService {
  private readonly config = inject(APP_CONFIG);

  readonly client: SupabaseClient = createClient(
    this.config.supabaseUrl,
    this.config.supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
}
