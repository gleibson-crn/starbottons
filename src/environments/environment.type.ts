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
  /**
   * Trilha 2 (ADR-020) — style transfer por IA via provedor EXTERNO pago.
   * DESLIGADO por default e OPCIONAL de propósito: o registry lê
   * `styleTransfer?.enabled ?? false`, então um `environment.ts` local
   * (skip-worktree) desatualizado continua compilando e a feature fica OFF.
   * Habilitar quebra o LOCAL-ONLY (a imagem sai da máquina) — decisão do dono.
   */
  readonly styleTransfer?: {
    /** Liga a integração de IA. Default efetivo: false. */
    readonly enabled: boolean;
    /** Id do provedor a usar (nenhum cablado ainda). Default: null. */
    readonly providerId: string | null;
  };
}
