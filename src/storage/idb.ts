/**
 * Minimal promise wrapper over IndexedDB. No dependency, just enough for our stores.
 */
export const DB_NAME = 'veyra';
export const DB_VERSION = 1;

export type StoreName = 'projects' | 'summaries' | 'handles' | 'thumbs' | 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser context.'));
      return;
    }
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      // v1 schema. Future versions add migrations here, keyed on event.oldVersion.
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('summaries')) db.createObjectStore('summaries', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
      if (!db.objectStoreNames.contains('thumbs')) db.createObjectStore('thumbs');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    open.onsuccess = () => {
      const db = open.result;
      // Another tab upgraded the schema: close so it can proceed, and reopen lazily.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    open.onerror = () => {
      dbPromise = null;
      reject(open.error);
    };
    open.onblocked = () => console.warn('IndexedDB upgrade blocked by another open tab.');
  });
  return dbPromise;
}

export async function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return req<T | undefined>(db.transaction(store, 'readonly').objectStore(store).get(key));
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return req<T[]>(db.transaction(store, 'readonly').objectStore(store).getAll());
}

export async function idbPut(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value, key);
  await txDone(tx);
}

export async function idbDelete(store: StoreName, key: IDBValidKey | IDBKeyRange): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

/** Run several writes atomically across stores. */
export async function idbTransaction(stores: StoreName[], fn: (tx: IDBTransaction) => void): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(stores, 'readwrite');
  fn(tx);
  await txDone(tx);
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

/** For tests: drop the cached connection. */
export function resetDbForTests(): void {
  dbPromise = null;
}
