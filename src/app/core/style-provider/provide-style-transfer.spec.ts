/**
 * provideStyleTransfer (Trilha 2, ADR-021) — registro CONDICIONAL. Com a flag
 * OFF (default versionado) o app initializer NÃO registra nenhum provedor →
 * `registry.uiAvailable()` permanece `false` e nenhum caminho de rede à Edge é
 * alcançável. Ligada (APP_CONFIG.styleTransfer.enabled=true), registra o
 * `GeminiEdgeStyleProvider` e dispara a probe de créditos no boot.
 *
 * O estado ON/OFF é dirigido pelo `APP_CONFIG` injetável (o registry e o provider
 * leem dele) — sem subclasses de teste, mantendo 1 classe por arquivo.
 */
import { ApplicationInitStatus, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SupabaseClientService } from '../supabase';
import { AiCreditStatus } from './ai-credit-status';
import { provideStyleTransfer } from './provide-style-transfer';
import { StyleProviderRegistry } from './registry';

const BASE = {
  production: false,
  supabaseUrl: 'https://proj.supabase.co',
  supabaseAnonKey: 'anon-key',
};
const CONFIG_OFF = { ...BASE, styleTransfer: { enabled: false, providerId: 'openai' } };
const CONFIG_ON = { ...BASE, styleTransfer: { enabled: true, providerId: 'openai' } };

const fakeSupabase = {
  client: {
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
};

/** Duble do AiCreditStatus (evita que a probe do boot faça rede de verdade). */
function creditSpy() {
  return {
    status: signal('unknown'),
    ensureChecked: vi.fn(async () => undefined),
    markNoCredits: vi.fn(),
  };
}

/** Configura o TestBed com um `APP_CONFIG` e providers extras; devolve o registry. */
function configure(
  config: typeof CONFIG_OFF,
  extra: unknown[] = [],
): StyleProviderRegistry {
  TestBed.configureTestingModule({
    providers: [
      provideStyleTransfer(),
      { provide: APP_CONFIG, useValue: config },
      { provide: SupabaseClientService, useValue: fakeSupabase },
      ...(extra as never[]),
    ],
  });
  return TestBed.inject(StyleProviderRegistry);
}

async function runInitializers(): Promise<void> {
  const status = TestBed.inject(ApplicationInitStatus) as ApplicationInitStatus & {
    runInitializers(): void;
  };
  // `runInitializers` é público em runtime (chamado pelo ApplicationRef), mas
  // não está no .d.ts — executa os APP_INITIALIZER registrados pelo provider.
  status.runInitializers();
  await status.donePromise;
}

describe('provideStyleTransfer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('com enabled=false NÃO registra nenhum provedor (zero rede, UI oculta)', async () => {
    const registry = configure(CONFIG_OFF);
    await runInitializers();

    expect(registry.enabled()).toBe(false);
    expect(registry.list()).toEqual([]);
    expect(registry.get('gemini-edge')).toBeNull();
    expect(registry.uiAvailable()).toBe(false);
  });

  it('com enabled=true registra o GeminiEdgeStyleProvider e libera a UI', async () => {
    const registry = configure(CONFIG_ON, [
      { provide: AiCreditStatus, useValue: creditSpy() },
    ]);

    await runInitializers();

    const provider = registry.get('gemini-edge');
    expect(provider).not.toBeNull();
    expect(provider?.id).toBe('gemini-edge');
    expect(registry.list()).toHaveLength(1);
    // enabled() true + provider configurado (isConfigured lê APP_CONFIG=ON) → UI disponível.
    expect(registry.uiAvailable()).toBe(true);
  });

  it('com provedor configurado, dispara a probe de créditos JÁ no boot', async () => {
    const credit = creditSpy();
    configure(CONFIG_ON, [{ provide: AiCreditStatus, useValue: credit }]);

    await runInitializers();

    // A verificação de créditos ocorre na inicialização (não só ao abrir o editor).
    expect(credit.ensureChecked).toHaveBeenCalledTimes(1);
  });
});
