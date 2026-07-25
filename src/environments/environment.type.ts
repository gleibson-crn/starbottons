/**
 * Contrato de configuração de ambiente da aplicação.
 * O arquivo `environment.ts` (skip-worktree) implementa este tipo.
 */
export interface Environment {
  /** Indica build de produção (habilita otimizações / desabilita dev tooling). */
  readonly production: boolean;
  /** URL do projeto Supabase, ex.: https://<ref>.supabase.co */
  readonly supabaseUrl: string;
  /** Chave anônima (public) do Supabase, usada pelo cliente no browser. */
  readonly supabaseAnonKey: string;
}
