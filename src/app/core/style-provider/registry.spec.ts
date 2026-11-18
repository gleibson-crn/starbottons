/**
 * StyleProviderRegistry (Trilha 2, ADR-020) — contrato "DESLIGADO por default":
 * sem provedores, `enabled()` false e `uiAvailable()` false com a config real.
 */
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { StyleProviderRegistry } from './registry';
import { NullStyleProvider } from './null-style-provider';
import type { StyleProvider } from './style-provider';

/** Config de teste com a feature DESLIGADA (independe do environment real). */
const OFF_CONFIG = {
  production: false,
  supabaseUrl: 'https://proj.supabase.co',
  supabaseAnonKey: 'anon-key',
  styleTransfer: { enabled: false, providerId: 'openai' },
};

function fakeProvider(id: string, configured: boolean): StyleProvider {
  return {
    id,
    displayName: id,
    requiresNetwork: true,
    isConfigured: () => configured,
    listStyles: async () => [{ id: 'cartoon', label: 'Cartoon' }],
    apply: async () => ({ image: new Blob(), provider: id }),
  };
}

describe('StyleProviderRegistry', () => {
  let registry: StyleProviderRegistry;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: APP_CONFIG, useValue: OFF_CONFIG }],
    });
    registry = TestBed.inject(StyleProviderRegistry);
  });

  it('nasce vazio e DESLIGADO (contrato OFF por default)', () => {
    expect(registry.list()).toEqual([]);
    // APP_CONFIG de teste tem styleTransfer.enabled === false (não o environment real).
    expect(registry.enabled()).toBe(false);
    expect(registry.uiAvailable()).toBe(false);
  });

  it('registra e recupera provedores por id', () => {
    const p = fakeProvider('acme', true);
    registry.register(p);
    expect(registry.get('acme')).toBe(p);
    expect(registry.list()).toHaveLength(1);
    expect(registry.get('inexistente')).toBeNull();
  });

  it('uiAvailable exige enabled E provedor configurado', () => {
    // Mesmo com provedor configurado, enabled()===false mantém a UI oculta.
    registry.register(fakeProvider('acme', true));
    expect(registry.enabled()).toBe(false);
    expect(registry.uiAvailable()).toBe(false);
  });
});

describe('StyleProviderRegistry — feature LIGADA (APP_CONFIG enabled:true)', () => {
  const ON_CONFIG = { ...OFF_CONFIG, styleTransfer: { enabled: true, providerId: 'openai' } };
  let registry: StyleProviderRegistry;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: APP_CONFIG, useValue: ON_CONFIG }],
    });
    registry = TestBed.inject(StyleProviderRegistry);
  });

  it('enabled() true; uiAvailable segue o provedor configurado', () => {
    expect(registry.enabled()).toBe(true);
    // Ligada, mas sem provedor ainda → UI oculta.
    expect(registry.uiAvailable()).toBe(false);
    // Provedor registrado porém NÃO configurado → ainda oculta.
    registry.register(fakeProvider('semchave', false));
    expect(registry.uiAvailable()).toBe(false);
    // Provedor configurado → UI disponível.
    registry.register(fakeProvider('acme', true));
    expect(registry.uiAvailable()).toBe(true);
  });
});

describe('NullStyleProvider', () => {
  it('não é configurado e rejeita apply (nunca faz rede)', async () => {
    const p = new NullStyleProvider();
    expect(p.isConfigured()).toBe(false);
    expect(p.requiresNetwork).toBe(true);
    await expect(p.listStyles()).resolves.toEqual([]);
    await expect(p.apply({ image: new Blob(), styleId: 'x' })).rejects.toThrow(/não configurado/);
  });
});
