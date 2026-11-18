/**
 * Wrapper mínimo (Promise) sobre o IndexedDB — DB `starbottons` v1 com dois
 * stores: `batch` (snapshot JSON do lote, chave fixa) e `blobs` (File de itens
 * cujo upload não concluiu, chave = itemId). Sem dependências externas.
 */
export type IdbStore = 'batch' | 'blobs';

const DB_NAME = 'starbottons';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

/** `true` quando o IndexedDB existe no ambiente (falso em SSR/jsdom/modo restrito). */
export function idbSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (): void => {
      const db = req.result;
      db.createObjectStore('batch');
      db.createObjectStore('blobs');
    };
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

async function run<T>(
  store: IdbStore,
  mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = op(tx.objectStore(store));
    tx.oncomplete = (): void => resolve(req.result);
    tx.onerror = (): void => reject(tx.error ?? req.error);
    tx.onabort = (): void => reject(tx.error ?? req.error);
  });
}

export function idbGet<T>(store: IdbStore, key: string): Promise<T | undefined> {
  return run<T | undefined>(store, 'readonly', (s) => s.get(key));
}

export async function idbPut(store: IdbStore, key: string, value: unknown): Promise<void> {
  await run(store, 'readwrite', (s) => s.put(value, key));
}

export async function idbDelete(store: IdbStore, key: string): Promise<void> {
  await run(store, 'readwrite', (s) => s.delete(key));
}

export async function idbClear(store: IdbStore): Promise<void> {
  await run(store, 'readwrite', (s) => s.clear());
}
