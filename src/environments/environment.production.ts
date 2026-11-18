import { Environment } from './environment.type';

/**
 * TEMPLATE de ambiente de produção (também skip-worktree no deploy).
 * Preenchido no pipeline/servidor com as credenciais reais de produção.
 * NÃO commitar segredos.
 */
export const environment: Environment = {
  production: true,
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
  // Trilha 2 (ADR-020): OFF por default. Ligar quebra o LOCAL-ONLY — decisão do dono.
  styleTransfer: { enabled: false, providerId: 'openai' },
};
