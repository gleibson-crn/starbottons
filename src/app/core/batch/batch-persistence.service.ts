import { inject, Injectable, Injector } from '@angular/core';
import { AuthService } from '../auth';
import { ToastService } from '../../shared/ui';
import { idbClear, idbDelete, idbGet, idbPut, idbSupported } from './idb';
import { parseSnapshot, type Snapshot } from './batch-snapshot';

const CURRENT_KEY = 'current';

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'QuotaExceededError';
}

/**
 * BatchPersistenceService — persistência do LOTE no IndexedDB (BL-008).
 * Guarda um JSON leve (`Snapshot`) e, só como fallback, o File de itens cujo
 * upload não concluiu. Best-effort: nunca lança para o chamador e vira no-op
 * quando o IndexedDB não existe. Auth/Toast são resolvidos sob demanda.
 */
@Injectable({ providedIn: 'root' })
export class BatchPersistenceService {
  private readonly injector = inject(Injector);
  private quotaWarned = false;
  private persistRequested = false;

  get available(): boolean {
    return idbSupported();
  }

  /** Id do usuário logado, ou `null` (nada é persistido sem usuário). */
  currentUserId(): string | null {
    return this.injector.get(AuthService).user()?.id ?? null;
  }

  async save(snapshot: Snapshot): Promise<void> {
    await this.guard(async () => {
      await this.requestPersistence();
      await idbPut('batch', CURRENT_KEY, snapshot);
    });
  }

  /** Lê o snapshot salvo; `null` se ausente/vencido/de outro usuário (e então o apaga). */
  async load(userId: string | null = this.currentUserId()): Promise<Snapshot | null> {
    if (!this.available || !userId) {
      return null;
    }
    try {
      const raw = await idbGet<unknown>('batch', CURRENT_KEY);
      if (raw === undefined) {
        return null;
      }
      const snap = parseSnapshot(raw, userId);
      if (!snap) {
        await this.clear();
      }
      return snap;
    } catch {
      return null;
    }
  }

  /** Apaga snapshot E blobs. */
  async clear(): Promise<void> {
    await this.guard(async () => {
      // Em paralelo: as transações nascem já, antes de qualquer putBlob posterior.
      await Promise.all([idbClear('batch'), idbClear('blobs')]);
    });
  }

  putBlob(id: string, file: Blob): Promise<void> {
    return this.guard(() => idbPut('blobs', id, file));
  }

  async getBlob(id: string): Promise<Blob | null> {
    if (!this.available) {
      return null;
    }
    try {
      return (await idbGet<Blob>('blobs', id)) ?? null;
    } catch {
      return null;
    }
  }

  deleteBlob(id: string): Promise<void> {
    return this.guard(() => idbDelete('blobs', id));
  }

  private async guard(op: () => Promise<void>): Promise<void> {
    if (!this.available) {
      return;
    }
    try {
      await op();
    } catch (err) {
      if (isQuotaError(err) && !this.quotaWarned) {
        this.quotaWarned = true;
        this.injector
          .get(ToastService)
          .error('Sem espaço para salvar o lote neste navegador. Baixe o ZIP para não perder.');
      }
    }
  }

  private async requestPersistence(): Promise<void> {
    if (this.persistRequested || typeof navigator === 'undefined' || !navigator.storage?.persist) {
      return;
    }
    this.persistRequested = true;
    try {
      await navigator.storage.persist();
    } catch {
      // best-effort
    }
  }
}
