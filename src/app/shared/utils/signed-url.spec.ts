import { withConfiguredHost } from './signed-url';

describe('withConfiguredHost', () => {
  const BASE = 'http://127.0.0.1:54321';

  it('reescreve o host interno da Edge (kong) para o baseUrl configurado', () => {
    const edge =
      'http://kong:8000/storage/v1/object/sign/renders/J/print.png?token=abc';
    expect(withConfiguredHost(edge, BASE)).toBe(
      'http://127.0.0.1:54321/storage/v1/object/sign/renders/J/print.png?token=abc',
    );
  });

  it('preserva path e query (token) ao trocar o host', () => {
    const out = withConfiguredHost(
      'http://kong:8000/a/b?token=xyz&k=1',
      BASE,
    );
    expect(out).toBe('http://127.0.0.1:54321/a/b?token=xyz&k=1');
  });

  it('é no-op quando o host já é o configurado (produção)', () => {
    const prod =
      'https://ref.supabase.co/storage/v1/object/sign/renders/J/print.pdf?token=t';
    expect(withConfiguredHost(prod, 'https://ref.supabase.co')).toBe(prod);
  });

  it('ignora barra final duplicada no baseUrl', () => {
    expect(withConfiguredHost('http://kong:8000/x?t=1', `${BASE}/`)).toBe(
      'http://127.0.0.1:54321/x?t=1',
    );
  });

  it('retorna null para url nula', () => {
    expect(withConfiguredHost(null, BASE)).toBeNull();
  });
});
