/**
 * GeminiEdgeStyleProvider (Trilha 2, ADR-021) — adaptador que fala SÓ com a Edge
 * `style-transfer`. Testes mockam `fetch` (SEM rede real) e a sessão do
 * Supabase: garantem que o body segue o contrato, que a resposta 200 é
 * decodificada em Blob, que erros HTTP viram Error com a msg da Edge e que o
 * `signal` de cancelamento é repassado. A chave do Gemini nunca aparece aqui.
 */
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SupabaseClientService } from '../supabase';
import { GeminiEdgeStyleProvider } from './gemini-edge-style-provider';
import { StyleTransferError } from './style-provider';

const CONFIG = {
  production: false,
  supabaseUrl: 'https://proj.supabase.co',
  supabaseAnonKey: 'anon-key',
  styleTransfer: { enabled: false, providerId: 'gemini' },
};

/** Sessão fake do Supabase (token de acesso do usuário). */
const fakeSupabase = {
  client: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'user-jwt' } } }),
    },
  },
};

function makeProvider(): GeminiEdgeStyleProvider {
  TestBed.configureTestingModule({
    providers: [
      { provide: APP_CONFIG, useValue: CONFIG },
      { provide: SupabaseClientService, useValue: fakeSupabase },
    ],
  });
  return TestBed.inject(GeminiEdgeStyleProvider);
}

/** Decodifica um Blob em base64 (sem prefixo) — espelha o encode do adaptador. */
async function blobBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin);
}

describe('GeminiEdgeStyleProvider — identidade e estilos', () => {
  it('expõe id/displayName/requiresNetwork e os 9 estilos da Edge', async () => {
    const p = makeProvider();
    expect(p.id).toBe('gemini-edge');
    expect(p.displayName).toBe('Estilo com IA');
    expect(p.requiresNetwork).toBe(true);

    const styles = await p.listStyles();
    expect(styles.map((s) => s.id)).toEqual([
      'cartoon',
      'aquarela',
      'hq',
      'pop-art',
      'esboco',
      'voce-amarelo',
      'guerreiro-espacial',
      'anime',
      'ghibli',
    ]);
  });

  it('isConfigured reflete environment.styleTransfer.enabled (false por default)', () => {
    const p = makeProvider();
    // A config versionada tem enabled === false → OFF.
    expect(p.isConfigured()).toBe(false);
  });
});

describe('GeminiEdgeStyleProvider — apply', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('monta o body no contrato e decodifica a resposta 200 em Blob', async () => {
    const p = makeProvider();
    const outB64 = await blobBase64(new Blob(['STYLED'], { type: 'image/png' }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        image_base64: outB64,
        mime_type: 'image/png',
        provider: 'gemini',
        cost_estimate_usd: 0.012,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const source = new Blob(['ORIG'], { type: 'image/png' });
    const res = await p.apply({ image: source, styleId: 'cartoon', strength: 0.6 });

    // URL + headers no padrão do GenerationGateway.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://proj.supabase.co/functions/v1/style-transfer');
    expect(init.method).toBe('POST');
    expect(init.headers.apikey).toBe('anon-key');
    expect(init.headers.Authorization).toBe('Bearer user-jwt');

    const body = JSON.parse(init.body);
    expect(body.image_base64).toBe(await blobBase64(source));
    expect(body.image_base64).not.toContain('data:'); // sem prefixo
    expect(body.mime_type).toBe('image/png');
    expect(body.style_id).toBe('cartoon');
    expect(body.strength).toBe(0.6);

    // Resposta decodificada.
    expect(res.image).toBeInstanceOf(Blob);
    expect(res.image.type).toBe('image/png');
    expect(await blobBase64(res.image)).toBe(outB64);
    expect(res.provider).toBe('gemini');
    expect(res.costEstimateUsd).toBe(0.012);
  });

  it('omite strength quando não informado', async () => {
    const p = makeProvider();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ image_base64: 'AAAA', mime_type: 'image/png' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await p.apply({ image: new Blob(['x'], { type: 'image/png' }), styleId: 'anime' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect('strength' in body).toBe(false);
  });

  it('erro HTTP vira Error com a mensagem segura da Edge', async () => {
    const p = makeProvider();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ error: 'Estilo inválido.' }),
      }),
    );
    await expect(
      p.apply({ image: new Blob(['x'], { type: 'image/png' }), styleId: 'x' }),
    ).rejects.toThrow('Estilo inválido.');
  });

  it('402 sem créditos lança StyleTransferError com code insufficient_credits', async () => {
    const p = makeProvider();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        json: async () => ({
          error: 'É necessário inserir créditos na OpenAI para usar os filtros com IA.',
          code: 'insufficient_credits',
        }),
      }),
    );

    const promise = p.apply({
      image: new Blob(['x'], { type: 'image/png' }),
      styleId: 'cartoon',
    });
    await expect(promise).rejects.toBeInstanceOf(StyleTransferError);
    await promise.catch((err: unknown) => {
      expect(err).toBeInstanceOf(StyleTransferError);
      const styleErr = err as StyleTransferError;
      expect(styleErr.code).toBe('insufficient_credits');
      expect(styleErr.message).toContain('inserir créditos');
    });
  });

  it('erro HTTP sem corpo usa fallback por status', async () => {
    const p = makeProvider();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => {
          throw new Error('no body');
        },
      }),
    );
    await expect(
      p.apply({ image: new Blob(['x'], { type: 'image/png' }), styleId: 'cartoon' }),
    ).rejects.toThrow('HTTP 503');
  });

  it('repassa o AbortSignal ao fetch', async () => {
    const p = makeProvider();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ image_base64: 'AAAA', mime_type: 'image/png' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    await p.apply({
      image: new Blob(['x'], { type: 'image/png' }),
      styleId: 'cartoon',
      signal: controller.signal,
    });
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});
