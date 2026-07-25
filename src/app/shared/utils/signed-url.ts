/**
 * Reescreve o host de uma signed URL para o `baseUrl` configurado, preservando
 * o path e a query (onde vai o token de acesso).
 *
 * A Edge Function assina os artefatos com o host interno dela — no ambiente
 * local do Supabase isso é `http://kong:8000`, que o browser não alcança. O
 * download precisa do host público do app (o `supabaseUrl` do environment).
 * Em produção os dois hosts coincidem, então a reescrita é um no-op.
 */
export function withConfiguredHost(
  url: string | null,
  baseUrl: string,
): string | null {
  if (!url) {
    return null;
  }
  const base = baseUrl.replace(/\/+$/, '');
  try {
    const parsed = new URL(url, base);
    return `${base}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
