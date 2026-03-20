export interface ScopeUser {
  id?: string;
  householdId?: string;
}

export interface CachedEntry<T = unknown> {
  key: string;
  value: T;
  updatedAt: number;
}

export interface ShoppingQueueEntry {
  id: string;
  scope: string;
  operation: 'add' | 'update' | 'toggle' | 'delete';
  itemId: string;
  listId?: string;
  body?: Record<string, unknown>;
  createdAt: number;
}

const DB_NAME = 'laris-home-offline';
const DB_VERSION = 1;
const CACHE_STORE = 'cache';
const QUEUE_STORE = 'shopping_queue';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        store.createIndex('scope', 'scope', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function toCacheKey(scope: string, path: string) {
  return `${scope}:${path}`;
}

export function getScopeFromUser(user: ScopeUser | null | undefined) {
  if (!user?.id || !user?.householdId) {
    return 'anonymous';
  }
  return `${user.id}:${user.householdId}`;
}

export function createOfflineId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getShoppingItemsPath(listId: string) {
  return `/shopping/lists/${listId}/items`;
}

export async function getCachedValue<T>(scope: string, path: string): Promise<T | undefined> {
  const key = toCacheKey(scope, path);
  const db = await openDb();
  const tx = db.transaction(CACHE_STORE, 'readonly');
  const store = tx.objectStore(CACHE_STORE);
  const entry = await runRequest(store.get(key) as IDBRequest<CachedEntry<T> | undefined>);
  return entry?.value;
}

export async function setCachedValue<T>(scope: string, path: string, value: T): Promise<void> {
  const key = toCacheKey(scope, path);
  const db = await openDb();
  const tx = db.transaction(CACHE_STORE, 'readwrite');
  const store = tx.objectStore(CACHE_STORE);
  await runRequest(store.put({ key, value, updatedAt: Date.now() }));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function listShoppingQueueEntries(scope: string): Promise<ShoppingQueueEntry[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDb();
      const tx = db.transaction(QUEUE_STORE, 'readonly');
      const store = tx.objectStore(QUEUE_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const entries = (request.result as ShoppingQueueEntry[]).filter((entry) => entry.scope === scope);
        entries.sort((a, b) => a.createdAt - b.createdAt);
        resolve(entries);
      };
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

export async function putShoppingQueueEntry(entry: ShoppingQueueEntry): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(QUEUE_STORE);
  await runRequest(store.put(entry));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function deleteShoppingQueueEntry(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(QUEUE_STORE);
  await runRequest(store.delete(id));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function replaceShoppingQueueItemId(scope: string, oldItemId: string, newItemId: string): Promise<void> {
  const entries = await listShoppingQueueEntries(scope);
  const affected = entries.filter((entry) => entry.itemId === oldItemId);
  for (const entry of affected) {
    await putShoppingQueueEntry({
      ...entry,
      itemId: newItemId,
    });
  }
}

export async function clearOfflineScopeData(scope: string): Promise<void> {
  const cachePrefix = `${scope}:`;

  await new Promise<void>(async (resolve, reject) => {
    try {
      const db = await openDb();
      const tx = db.transaction([CACHE_STORE, QUEUE_STORE], 'readwrite');
      const cacheStore = tx.objectStore(CACHE_STORE);
      const queueStore = tx.objectStore(QUEUE_STORE);

      cacheStore.openCursor().onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(cachePrefix)) {
          cursor.delete();
        }
        cursor.continue();
      };

      queueStore.openCursor().onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) return;
        if (cursor.value.scope === scope) {
          cursor.delete();
        }
        cursor.continue();
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (error) {
      reject(error);
    }
  });
}
