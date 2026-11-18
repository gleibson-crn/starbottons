/**
 * AiCreditStatus — status de crédito da conta de IA, cacheado por SESSÃO.
 * `ensureChecked` dispara a probe SÓ enquanto `unknown` (uma vez) e mapeia:
 * resolve → `ok`; `insufficient_credits` → `no_credits`; erro alheio → `unknown`.
 */
import { TestBed } from '@angular/core/testing';
import { AiCreditStatus } from './ai-credit-status';
import { StyleTransferError } from './style-provider';

const CACHE_KEY = 'sb.aiCredits.v1';

/**
 * Instância FRESCA do serviço a cada chamada (reset do injetor) — permite simular
 * um "reload" do app: uma 2ª chamada re-executa o construtor, que relê o cache
 * persistente do `localStorage` (este NÃO é limpo pelo reset do TestBed).
 */
function service(): AiCreditStatus {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(AiCreditStatus);
}

describe('AiCreditStatus', () => {
  // Cada teste parte de um cache persistente LIMPO (o serviço lê localStorage
  // no init; um `ok` deixado por outro teste contaminaria os demais).
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* localStorage indisponível no ambiente: os testes de cache viram no-op */
    }
  });

  it('começa em unknown', () => {
    expect(service().status()).toBe('unknown');
  });

  it('probe que resolve → ok', async () => {
    const s = service();
    await s.ensureChecked(async () => undefined);
    expect(s.status()).toBe('ok');
  });

  it('probe com insufficient_credits → no_credits', async () => {
    const s = service();
    await s.ensureChecked(async () => {
      throw new StyleTransferError('sem crédito', 'insufficient_credits');
    });
    expect(s.status()).toBe('no_credits');
  });

  it('erro alheio (rede/canvas) mantém unknown', async () => {
    const s = service();
    await s.ensureChecked(async () => {
      throw new Error('falha de rede');
    });
    expect(s.status()).toBe('unknown');
  });

  it('dispara a probe só uma vez (cache de sessão)', async () => {
    const s = service();
    const probe = vi.fn().mockResolvedValue(undefined);
    await s.ensureChecked(probe);
    await s.ensureChecked(probe);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(s.status()).toBe('ok');
  });

  it('markNoCredits força no_credits', () => {
    const s = service();
    s.markNoCredits();
    expect(s.status()).toBe('no_credits');
  });

  it('probe ok PERSISTE em localStorage (não reproba após reload)', async () => {
    await service().ensureChecked(async () => undefined);
    // Novo serviço (simula reload): nasce `ok` do cache e NÃO chama a probe.
    const s2 = service();
    expect(s2.status()).toBe('ok');
    const probe = vi.fn().mockResolvedValue(undefined);
    await s2.ensureChecked(probe);
    expect(probe).not.toHaveBeenCalled();
  });

  it('cache de ok EXPIRADO (> TTL) não semeia ok', () => {
    const oito_dias = 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: 'ok', ts: Date.now() - oito_dias }));
    expect(service().status()).toBe('unknown');
  });

  it('markNoCredits limpa o cache persistente (próximo load reproba)', async () => {
    const s = service();
    await s.ensureChecked(async () => undefined); // grava ok no cache
    s.markNoCredits(); // deve limpar
    expect(service().status()).toBe('unknown'); // novo serviço não vê ok cacheado
  });
});
