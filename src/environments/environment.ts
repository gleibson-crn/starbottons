import { Environment } from './environment.type';

/**
 * TEMPLATE de ambiente (skip-worktree).
 *
 * Este arquivo é versionado APENAS com placeholders. Cada desenvolvedor
 * preenche `supabaseUrl` e `supabaseAnonKey` localmente com as credenciais
 * do projeto Supabase, SEM commitar os valores reais.
 *
 * Após preencher, garanta que o Git ignora suas edições locais:
 *   git update-index --skip-worktree src/environments/environment.ts
 *
 * Para voltar a ver mudanças (ex.: novo campo no template):
 *   git update-index --no-skip-worktree src/environments/environment.ts
 *
 * NUNCA faça commit de segredos aqui. A anon key é pública por design,
 * mas mantemos o template limpo para evitar vazar URLs/keys de projetos.
 */
export const environment: Environment = {
  production: false,
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
};
