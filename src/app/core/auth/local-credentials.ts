/**
 * Credenciais do usuário FIXO LOCAL (ver RUNNING.md). Única fonte do hardcode:
 * o app roda como "desktop" local-only (Supabase em 127.0.0.1) e entra sem
 * pedir login. NÃO use estes valores em nenhum ambiente remoto.
 */
export const LOCAL_USER = {
  email: 'teste@starbottons.local',
  password: 'teste123456',
} as const;
