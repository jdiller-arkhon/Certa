'use client';

/**
 * Minimal IndexedDB key-value store for the offline cache and the flight outbox. Every call
 * fails soft: private windows, blocked storage, or old browsers just get no offline support.
 */
const DB = 'certa';
const VERSION = 1;
export type StoreName = 'cache' | 'outbox';

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  opening ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const req = fn(db.transaction(store, mode).objectStore(store));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export const idb = {
  get: <T>(store: StoreName, key: string) => run<T>(store, 'readonly', (s) => s.get(key) as IDBRequest<T>),
  set: (store: StoreName, key: string, value: unknown) => run(store, 'readwrite', (s) => s.put(value, key)),
  del: (store: StoreName, key: string) => run(store, 'readwrite', (s) => s.delete(key)),
  values: async <T>(store: StoreName) => (await run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)) ?? [],
  clear: (store: StoreName) => run(store, 'readwrite', (s) => s.clear()),
};

/** UUIDv7: time-ordered, so offline-created flights sort correctly and retries are idempotent. */
export function uuidv7(now = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const ts = BigInt(now);
  for (let i = 0; i < 6; i++) bytes[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
