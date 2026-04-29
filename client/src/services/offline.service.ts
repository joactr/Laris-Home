export interface ScopeUser {
  id?: string;
  householdId?: string | null;
}

export interface CachedEntry<T = unknown> {
  key: string;
  value: T;
  updatedAt: number;
}

export interface ScopedCachedEntry<T = unknown> {
  path: string;
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
  status?: 'pending' | 'failed';
  attempts?: number;
  lastError?: string | null;
}

export interface OfflineMutationEntry {
  id: string;
  scope: string;
  resource: 'calendar' | 'chores' | 'meals';
  operation: 'create' | 'update' | 'delete' | 'status';
  entityId: string;
  path: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
  createdAt: number;
  status?: 'pending' | 'failed';
  attempts?: number;
  lastError?: string | null;
}

const DB_NAME = 'laris-home-offline';
const DB_VERSION = 2;
const CACHE_STORE = 'cache';
const SHOPPING_QUEUE_STORE = 'shopping_queue';
const MUTATION_QUEUE_STORE = 'mutation_queue';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(SHOPPING_QUEUE_STORE)) {
        const store = db.createObjectStore(SHOPPING_QUEUE_STORE, { keyPath: 'id' });
        store.createIndex('scope', 'scope', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(MUTATION_QUEUE_STORE)) {
        const store = db.createObjectStore(MUTATION_QUEUE_STORE, { keyPath: 'id' });
        store.createIndex('scope', 'scope', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('resource', 'resource', { unique: false });
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

export async function listScopedCacheEntries<T>(scope: string, prefix?: string): Promise<ScopedCachedEntry<T>[]> {
  const cachePrefix = `${scope}:`;
  const entries: ScopedCachedEntry<T>[] = [];

  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDb();
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const store = tx.objectStore(CACHE_STORE);
      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(entries);
          return;
        }

        const rawEntry = cursor.value as CachedEntry<T>;
        if (String(rawEntry.key).startsWith(cachePrefix)) {
          const path = String(rawEntry.key).slice(cachePrefix.length);
          if (!prefix || path.startsWith(prefix)) {
            entries.push({
              path,
              value: rawEntry.value,
              updatedAt: rawEntry.updatedAt,
            });
          }
        }
        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

export async function listShoppingQueueEntries(scope: string): Promise<ShoppingQueueEntry[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDb();
      const tx = db.transaction(SHOPPING_QUEUE_STORE, 'readonly');
      const store = tx.objectStore(SHOPPING_QUEUE_STORE);
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
  const tx = db.transaction(SHOPPING_QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(SHOPPING_QUEUE_STORE);
  await runRequest(store.put(entry));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function deleteShoppingQueueEntry(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SHOPPING_QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(SHOPPING_QUEUE_STORE);
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

export async function listOfflineMutationEntries(scope: string): Promise<OfflineMutationEntry[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDb();
      const tx = db.transaction(MUTATION_QUEUE_STORE, 'readonly');
      const store = tx.objectStore(MUTATION_QUEUE_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const entries = (request.result as OfflineMutationEntry[]).filter((entry) => entry.scope === scope);
        entries.sort((a, b) => a.createdAt - b.createdAt);
        resolve(entries);
      };
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

export async function putOfflineMutationEntry(entry: OfflineMutationEntry): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(MUTATION_QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(MUTATION_QUEUE_STORE);
  await runRequest(store.put(entry));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function deleteOfflineMutationEntry(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(MUTATION_QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(MUTATION_QUEUE_STORE);
  await runRequest(store.delete(id));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function clearOfflineScopeData(scope: string): Promise<void> {
  const cachePrefix = `${scope}:`;

  await new Promise<void>(async (resolve, reject) => {
    try {
      const db = await openDb();
      const tx = db.transaction([CACHE_STORE, SHOPPING_QUEUE_STORE, MUTATION_QUEUE_STORE], 'readwrite');
      const cacheStore = tx.objectStore(CACHE_STORE);
      const shoppingQueueStore = tx.objectStore(SHOPPING_QUEUE_STORE);
      const mutationQueueStore = tx.objectStore(MUTATION_QUEUE_STORE);

      cacheStore.openCursor().onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(cachePrefix)) {
          cursor.delete();
        }
        cursor.continue();
      };

      shoppingQueueStore.openCursor().onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) return;
        if (cursor.value.scope === scope) {
          cursor.delete();
        }
        cursor.continue();
      };

      mutationQueueStore.openCursor().onsuccess = (event) => {
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
