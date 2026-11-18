import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { Injector, runInInjectionContext } from '@angular/core';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchPersistenceService } from './batch-persistence.service';
import type { Snapshot } from './batch-snapshot';

// Sem @types/node: carrega o Blob do Node dinamicamente (o do jsdom nao e clonavel pelo structuredClone).
const nodeBuffer: { Blob: typeof Blob } = await import(/* @vite-ignore */ ['node', 'buffer'].join(':'));
const NodeBlob = nodeBuffer.Blob;

const USER = 'user-1';
const DAY = 24 * 60 * 60 * 1000;

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    v: 1,
    batchId: 'batch-1',
    savedAt: Date.now(),
    userId: USER,
    items: [
      {
        id: 'item-1',
        name: 'Botton 1',
        fileName: 'a.png',
        width: 800,
        height: 600,
        transform: { scale: 1.5, offsetX: 10, offsetY: -4 } as never,
        editorSide: 300,
        filters: {} as never,
        style: {} as never,
        selectedSizes: [32, 58],
        upload: { id: 'up-1', path: 'u/a.png', fileName: 'a.png', width: 800, height: 600 } as never,
        arts: { 32: { status: 'ready', jobId: 'job-1' } },
      },
    ],
    ...overrides,
  };
}

/**
 * Cria um service REAL numa "sessão" nova: reseta o registry de módulos (zera o
 * `dbPromise` em cache do idb.ts, simulando reload da página) sem trocar o
 * IndexedDB — logo os dados persistidos sobrevivem.
 */
async function openSession(userId: string | null = USER): Promise<BatchPersistenceService> {
  vi.resetModules();
  const { BatchPersistenceService: Service } = await import('./batch-persistence.service');
  const { AuthService } = await import('../auth');
  const { ToastService } = await import('../../shared/ui');
  const injector = Injector.create({
    providers: [
      { provide: AuthService, useValue: { user: () => (userId ? { id: userId } : null) } },
      { provide: ToastService, useValue: { error: vi.fn() } },
    ],
  });
  return runInInjectionContext(injector, () => new Service());
}

describe('idb + BatchPersistenceService (IndexedDB real via fake-indexeddb)', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist: vi.fn().mockResolvedValue(true) },
    });
  });

  // fake-indexeddb/auto instala globais; remove-os para nao vazar p/ outros specs (o BatchStore deles passaria a achar IndexedDB disponivel).
  afterAll(() => {
    for (const k of ['indexedDB', 'IDBFactory', 'IDBDatabase', 'IDBObjectStore', 'IDBTransaction', 'IDBRequest', 'IDBOpenDBRequest', 'IDBKeyRange', 'IDBCursor', 'IDBCursorWithValue', 'IDBIndex', 'IDBVersionChangeEvent']) {
      Reflect.deleteProperty(globalThis, k);
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return null when loading from a brand new empty database', async () => {
    const service = await openSession();

    const result = await service.load();

    expect(result).toBeNull();
  });

  it('should return the same snapshot after save and load', async () => {
    const service = await openSession();
    const snapshot = makeSnapshot();

    await service.save(snapshot);
    const loaded = await service.load();

    expect(loaded).toEqual(snapshot);
  });

  it('should request persistent storage when saving', async () => {
    const service = await openSession();

    await service.save(makeSnapshot());

    expect(navigator.storage.persist).toHaveBeenCalledTimes(1);
  });

  it('should return null after clear', async () => {
    const service = await openSession();
    await service.save(makeSnapshot());

    await service.clear();
    const loaded = await service.load();

    expect(loaded).toBeNull();
  });

  it('should keep the snapshot after closing and reopening the connection', async () => {
    const first = await openSession();
    const snapshot = makeSnapshot();
    await first.save(snapshot);

    const second = await openSession();
    const loaded = await second.load();

    expect(loaded).toEqual(snapshot);
  });

  it('should keep the latest snapshot when saving twice with the same key', async () => {
    const service = await openSession();
    await service.save(makeSnapshot({ batchId: 'old' }));

    await service.save(makeSnapshot({ batchId: 'new' }));
    const loaded = await service.load();

    expect(loaded?.batchId).toBe('new');
  });

  it('should return the stored blob with the right bytes', async () => {
    const service = await openSession();
    const bytes = new Uint8Array([1, 2, 3, 250, 255]);
    await service.putBlob('item-1', new NodeBlob([bytes], { type: 'image/png' }));

    const blob = await service.getBlob('item-1');

    expect(blob).not.toBeNull();
    expect(new Uint8Array(await readBytes(blob as Blob))).toEqual(bytes);
    expect(blob?.type).toBe('image/png');
  });

  it('should keep the blob after reopening the connection', async () => {
    const first = await openSession();
    await first.putBlob('item-1', new NodeBlob([new Uint8Array([9, 8, 7])], { type: 'image/jpeg' }));

    const second = await openSession();
    const blob = await second.getBlob('item-1');

    expect(new Uint8Array(await readBytes(blob as Blob))).toEqual(new Uint8Array([9, 8, 7]));
  });

  it('should return null for a blob that was never stored', async () => {
    const service = await openSession();

    const blob = await service.getBlob('missing');

    expect(blob).toBeNull();
  });

  it('should remove the blob on deleteBlob without touching others', async () => {
    const service = await openSession();
    await service.putBlob('a', new NodeBlob(['aa']));
    await service.putBlob('b', new NodeBlob(['bb']));

    await service.deleteBlob('a');

    expect(await service.getBlob('a')).toBeNull();
    expect(await service.getBlob('b')).not.toBeNull();
  });

  it('should remove blobs together with the snapshot on clear', async () => {
    const service = await openSession();
    await service.save(makeSnapshot());
    await service.putBlob('a', new NodeBlob(['aa']));

    await service.clear();

    expect(await service.getBlob('a')).toBeNull();
  });

  it('should discard a snapshot older than 7 days on load and erase it', async () => {
    const service = await openSession();
    await service.save(makeSnapshot({ savedAt: Date.now() - 7 * DAY - 60_000 }));

    const loaded = await service.load();
    const secondLoad = await service.load();

    expect(loaded).toBeNull();
    expect(secondLoad).toBeNull();
  });

  it('should keep a snapshot saved just under 7 days ago', async () => {
    const service = await openSession();
    const snapshot = makeSnapshot({ savedAt: Date.now() - 7 * DAY + 60_000 });
    await service.save(snapshot);

    const loaded = await service.load();

    expect(loaded).toEqual(snapshot);
  });

  it('should discard a snapshot that belongs to another user and erase it', async () => {
    const owner = await openSession(USER);
    await owner.save(makeSnapshot());

    const other = await openSession('user-2');
    const loadedByOther = await other.load();
    const loadedByOwnerAfter = await (await openSession(USER)).load();

    expect(loadedByOther).toBeNull();
    expect(loadedByOwnerAfter).toBeNull();
  });

  it('should return null without reading when there is no logged user', async () => {
    const service = await openSession(null);
    await service.save(makeSnapshot());

    const loaded = await service.load();

    expect(loaded).toBeNull();
  });
});

/** jsdom Blob nao e clonavel pelo structuredClone do Node (usado pelo fake-indexeddb); o spec grava o Blob do Node. */
function readBytes(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}
