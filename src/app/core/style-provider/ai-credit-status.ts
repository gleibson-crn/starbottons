import { Injectable, signal } from '@angular/core';
import { StyleTransferError } from './style-provider';

/**
 * Estado do crédito da conta de IA nesta SESSÃO:
 * - `unknown`  — ainda não checado (ou a checagem falhou por motivo alheio);
 * - `checking` — probe em voo;
 * - `ok`       — há crédito (uma micro-geração foi aceita);
 * - `no_credits` — a Edge respondeu `insufficient_credits` (HTTP 402).
 */
export type AiCreditState = 'unknown' | 'checking' | 'ok' | 'no_credits';

/** Chave e validade do cache PERSISTENTE do resultado "ok" da probe. */
const CACHE_KEY = 'sb.aiCredits.v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

/**
 * Trilha 2 (ADR-021) — status de crédito da conta de IA.
 *
 * A checagem é feita UMA vez (`ensureChecked` só dispara a probe enquanto o
 * estado for `unknown`) porque, COM créditos, a probe custa uma micro-geração
 * real. Enquanto SEM créditos ela é grátis — o erro de billing
 * (`insufficient_credits`) é pré-cobrança. Erros alheios (rede, canvas)
 * mantêm `unknown`: não bloqueiam a UI, apenas deixam para descobrir na
 * aplicação real.
 *
 * CACHE PERSISTENTE (localStorage): o resultado `ok` é lembrado por
 * `CACHE_TTL_MS` ENTRE RECARREGAMENTOS — assim a probe paga (~US$0,01–0,04) roda
 * no máximo uma vez a cada 7 dias, e não a cada reload/HMR do app. Só o `ok` é
 * cacheado (o `no_credits` é grátis de redetectar e pode ficar obsoleto se o
 * dono adicionar créditos). `markNoCredits` limpa o cache para o próximo load
 * reprovar. Todo acesso a `localStorage` é defensivo (janela privada/bloqueada).
 */
@Injectable({ providedIn: 'root' })
export class AiCreditStatus {
  private readonly _status = signal<AiCreditState>(
    this.readCachedOk() ? 'ok' : 'unknown',
  );
  /** Estado atual (readonly para consumidores). */
  readonly status = this._status.asReadonly();

  /**
   * Dispara `probe` só se o estado ainda for `unknown` (cache por sessão +
   * persistente). Se o cache persistente já disse `ok`, o estado nasce `ok` e a
   * probe NÃO roda (não gasta). `probe` deve resolver quando há crédito e
   * rejeitar com `StyleTransferError` `insufficient_credits` quando não há;
   * qualquer outra falha volta a `unknown` (sem bloquear a UI).
   */
  async ensureChecked(probe: () => Promise<void>): Promise<void> {
    if (this._status() !== 'unknown') {
      return;
    }
    this._status.set('checking');
    try {
      await probe();
      this._status.set('ok');
      this.writeCachedOk(); // lembra entre reloads → não reproba (nem gasta)
    } catch (err) {
      this._status.set(this.mapError(err));
    }
  }

  /**
   * Marca `no_credits` diretamente — usado quando uma aplicação REAL retorna
   * `insufficient_credits`. Limpa o cache persistente para o próximo load
   * reprovar (redetecta grátis se o dono ainda não recarregou créditos).
   */
  markNoCredits(): void {
    this._status.set('no_credits');
    this.clearCache();
  }

  private mapError(err: unknown): AiCreditState {
    return err instanceof StyleTransferError &&
      err.code === 'insufficient_credits'
      ? 'no_credits'
      : 'unknown';
  }

  /** `true` se há um `ok` cacheado e ainda dentro da validade. */
  private readCachedOk(): boolean {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const { v, ts } = JSON.parse(raw) as { v?: string; ts?: number };
      return v === 'ok' && typeof ts === 'number' && Date.now() - ts < CACHE_TTL_MS;
    } catch {
      return false; // localStorage indisponível/corrompido → trata como sem cache
    }
  }

  private writeCachedOk(): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ v: 'ok', ts: Date.now() }));
    } catch {
      // janela privada/armazenamento cheio: seguimos sem persistir (cache de sessão)
    }
  }

  private clearCache(): void {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // idem: sem persistência, sem problema
    }
  }
}
