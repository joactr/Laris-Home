import { useAuthStore } from '../store/auth';
import { useOfflineStore } from '../store/offline';
import {
    createOfflineId,
    getCachedValue,
    getScopeFromUser,
    getShoppingItemsPath,
    listShoppingQueueEntries,
    putShoppingQueueEntry,
    deleteShoppingQueueEntry,
    replaceShoppingQueueItemId,
    setCachedValue,
    type ShoppingQueueEntry,
} from '../services/offline.service';

const BASE = '/api';

type VoiceEnvelopeStatus = 'success' | 'needs_review' | 'fallback';

export type VoiceEnvelope<T extends Record<string, unknown>> = {
    status: VoiceEnvelopeStatus;
    message: string;
    code?: string;
    retryable?: boolean;
    transcript?: string;
} & T;

type RequestConfig = {
    bypassOfflineGuard?: boolean;
};

function getToken() {
    return useAuthStore.getState().token;
}

function getCurrentUser() {
    return useAuthStore.getState().user;
}

function getCurrentScope() {
    return getScopeFromUser(getCurrentUser());
}

function isOffline() {
    return typeof navigator !== 'undefined' && !navigator.onLine;
}

function isOfflineError(error: unknown) {
    return error instanceof TypeError || (error instanceof Error && error.message === 'OFFLINE_UNAVAILABLE');
}

function shouldCacheGet(path: string) {
    return (
        path === '/dashboard' ||
        path === '/shopping/lists' ||
        /^\/shopping\/lists\/[^/]+\/items$/.test(path) ||
        path.startsWith('/meals?') ||
        path === '/recipes' ||
        /^\/recipes\/[^/]+$/.test(path)
    );
}

function getCachedPath(path: string) {
    return shouldCacheGet(path) ? path : null;
}

async function rawRequest<T>(path: string, options: RequestInit = {}, config: RequestConfig = {}): Promise<T> {
    const token = getToken();
    const shouldAttachAuth = !!token && path !== '/auth/login';
    const method = options.method || 'GET';
    const cachePath = method === 'GET' ? getCachedPath(path) : null;
    const scope = getCurrentScope();

    if (method !== 'GET' && !config.bypassOfflineGuard && isOffline()) {
        throw new Error('OFFLINE_UNAVAILABLE');
    }

    if (method === 'GET' && isOffline() && cachePath) {
        const cached = await getCachedValue<T>(scope, cachePath);
        if (cached !== undefined) {
            return cached;
        }
    }

    try {
        const res = await fetch(`${BASE}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(shouldAttachAuth ? { Authorization: `Bearer ${token}` } : {}),
                ...options.headers,
            },
            body: options.body,
        });

        if (res.status === 401 && shouldAttachAuth) {
            useAuthStore.getState().logout();
            throw new Error('TOKEN_EXPIRED');
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            const errMsg = typeof err.error === 'string'
                ? err.error
                : JSON.stringify(err.error ?? err);
            throw new Error(errMsg || 'Request failed');
        }

        if (res.status === 204) {
            return undefined as T;
        }

        const data = await res.json();
        if (cachePath) {
            await setCachedValue(scope, cachePath, data);
        }
        return data as T;
    } catch (error) {
        if (cachePath && isOfflineError(error)) {
            const cached = await getCachedValue<T>(scope, cachePath);
            if (cached !== undefined) {
                return cached;
            }
        }
        throw error;
    }
}

async function updatePendingCount() {
    const entries = await listShoppingQueueEntries(getCurrentScope());
    useOfflineStore.getState().setPendingCount(entries.length);
}

async function readCachedShoppingItems(listId: string) {
    return (await getCachedValue<any[]>(getCurrentScope(), getShoppingItemsPath(listId))) || [];
}

async function writeCachedShoppingItems(listId: string, items: any[]) {
    await setCachedValue(getCurrentScope(), getShoppingItemsPath(listId), items);
}

function buildOptimisticShoppingItem(listId: string, data: Record<string, unknown>) {
    const user = getCurrentUser();
    return {
        id: createOfflineId('shopping_item'),
        list_id: listId,
        name: String(data.name || '').trim(),
        quantity: typeof data.quantity === 'number' ? data.quantity : data.quantity ? Number(data.quantity) : null,
        unit: data.unit ?? null,
        category: data.category ?? null,
        notes: data.notes ?? null,
        is_completed: false,
        completed_at: null,
        created_at: new Date().toISOString(),
        added_by_name: user?.name,
        added_by_color: user?.color,
        pending_sync: true,
        sync_error: null,
        local_only: true,
    };
}

async function markCachedItem(listId: string, itemId: string, updater: (item: any) => any) {
    const items = await readCachedShoppingItems(listId);
    await writeCachedShoppingItems(listId, items.map((item) => item.id === itemId ? updater(item) : item));
}

async function removeCachedItem(listId: string, itemId: string) {
    const items = await readCachedShoppingItems(listId);
    await writeCachedShoppingItems(listId, items.filter((item) => item.id !== itemId));
}

async function replaceCachedItemId(listId: string, oldId: string, nextItem: any) {
    const items = await readCachedShoppingItems(listId);
    await writeCachedShoppingItems(listId, items.map((item) => (
        item.id === oldId
            ? { ...nextItem, pending_sync: false, sync_error: null, local_only: false }
            : item
    )));
}

async function enqueueShoppingOperation(entry: Omit<ShoppingQueueEntry, 'id' | 'scope' | 'createdAt'>) {
    await putShoppingQueueEntry({
        ...entry,
        id: createOfflineId('shopping_queue'),
        scope: getCurrentScope(),
        createdAt: Date.now(),
    });
    await updatePendingCount();
}

async function findQueuedCreate(itemId: string) {
    const entries = await listShoppingQueueEntries(getCurrentScope());
    return entries.find((entry) => entry.operation === 'add' && entry.itemId === itemId);
}

async function removeQueuedEntriesForItem(itemId: string) {
    const entries = await listShoppingQueueEntries(getCurrentScope());
    const affected = entries.filter((entry) => entry.itemId === itemId);
    for (const entry of affected) {
        await deleteShoppingQueueEntry(entry.id);
    }
    await updatePendingCount();
}

async function syncShoppingQueue() {
    if (isOffline() || !getToken()) {
        return;
    }

    const scope = getCurrentScope();
    const entries = await listShoppingQueueEntries(scope);

    for (const entry of entries) {
        try {
            if (entry.operation === 'add') {
                const created = await rawRequest<any>(
                    `/shopping/lists/${entry.listId}/items`,
                    { method: 'POST', body: JSON.stringify(entry.body || {}) },
                    { bypassOfflineGuard: true }
                );
                await replaceCachedItemId(entry.listId!, entry.itemId, created);
                await replaceShoppingQueueItemId(scope, entry.itemId, created.id);
            } else if (entry.operation === 'update') {
                const updated = await rawRequest<any>(
                    `/shopping/items/${entry.itemId}`,
                    { method: 'PATCH', body: JSON.stringify(entry.body || {}) },
                    { bypassOfflineGuard: true }
                );
                await markCachedItem(entry.listId!, updated.id, (item) => ({
                    ...item,
                    ...updated,
                    pending_sync: false,
                    sync_error: null,
                    local_only: false,
                }));
            } else if (entry.operation === 'toggle') {
                const updated = await rawRequest<any>(
                    `/shopping/items/${entry.itemId}/complete`,
                    { method: 'PATCH' },
                    { bypassOfflineGuard: true }
                );
                await markCachedItem(entry.listId!, updated.id, (item) => ({
                    ...item,
                    ...updated,
                    pending_sync: false,
                    sync_error: null,
                    local_only: false,
                }));
            } else if (entry.operation === 'delete') {
                await rawRequest<any>(
                    `/shopping/items/${entry.itemId}`,
                    { method: 'DELETE' },
                    { bypassOfflineGuard: true }
                );
                await removeCachedItem(entry.listId!, entry.itemId);
            }

            await deleteShoppingQueueEntry(entry.id);
        } catch (error: any) {
            if (entry.listId) {
                const message = error?.message || 'No se pudo sincronizar este cambio';
                await markCachedItem(entry.listId, entry.itemId, (item) => ({
                    ...item,
                    pending_sync: false,
                    sync_error: message,
                }));
            }

            if (entry.operation === 'add') {
                const queuedEntries = await listShoppingQueueEntries(scope);
                const dependentEntries = queuedEntries.filter((queuedEntry) => queuedEntry.itemId === entry.itemId);
                for (const dependentEntry of dependentEntries) {
                    await deleteShoppingQueueEntry(dependentEntry.id);
                }
            } else {
                await deleteShoppingQueueEntry(entry.id);
            }
        }
    }

    useOfflineStore.getState().setLastSyncedAt(Date.now());
    await updatePendingCount();
}

let initialized = false;

export function initializeClientDataLayer() {
    if (initialized || typeof window === 'undefined') {
        return;
    }

    initialized = true;
    useOfflineStore.getState().setIsOffline(isOffline());

    void updatePendingCount();
    void syncShoppingQueue();

    window.addEventListener('online', () => {
        useOfflineStore.getState().setIsOffline(false);
        void syncShoppingQueue();
    });

    window.addEventListener('offline', () => {
        useOfflineStore.getState().setIsOffline(true);
    });
}

export async function refreshOfflineDataState() {
    useOfflineStore.getState().setIsOffline(isOffline());
    await updatePendingCount();
    if (!isOffline()) {
        await syncShoppingQueue();
    }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    return rawRequest<T>(path, options);
}

// Auth
export const api = {
    auth: {
        login: (username: string, password: string) =>
            request<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
        register: (name: string, username: string, password: string) =>
            request<{ user: any }>('/auth/register', { method: 'POST', body: JSON.stringify({ name, username, password }) }),
        getUsers: () => request<any[]>('/auth/users'),
        changePassword: (id: string, password: string) => request<any>(`/auth/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
        me: () => request<any>('/auth/me'),
        members: () => request<any[]>('/auth/household/members'),
    },
    dashboard: {
        get: () => request<any>('/dashboard'),
    },
    shopping: {
        getLists: () => request<any[]>('/shopping/lists'),
        createList: (name: string) => request<any>('/shopping/lists', { method: 'POST', body: JSON.stringify({ name }) }),
        deleteList: (id: string) => request<any>(`/shopping/lists/${id}`, { method: 'DELETE' }),
        getItems: async (listId: string) => {
            const cached = await getCachedValue<any[]>(getCurrentScope(), getShoppingItemsPath(listId));
            const hasPendingLocalState = !!cached?.some((item) => item.pending_sync || item.local_only || item.sync_error);

            if (isOffline() && cached) {
                return cached;
            }

            if (hasPendingLocalState && cached) {
                return cached;
            }

            return request<any[]>(`/shopping/lists/${listId}/items`);
        },
        addItem: async (listId: string, data: Record<string, unknown>) => {
            if (!isOffline()) {
                try {
                    const created = await request<any>(`/shopping/lists/${listId}/items`, { method: 'POST', body: JSON.stringify(data) });
                    const items = await readCachedShoppingItems(listId);
                    await writeCachedShoppingItems(listId, [created, ...items.filter((item) => item.id !== created.id)]);
                    return created;
                } catch (error) {
                    if (!isOfflineError(error)) throw error;
                }
            }

            const optimisticItem = buildOptimisticShoppingItem(listId, data);
            const items = await readCachedShoppingItems(listId);
            await writeCachedShoppingItems(listId, [optimisticItem, ...items]);
            await enqueueShoppingOperation({
                operation: 'add',
                itemId: optimisticItem.id,
                listId,
                body: data,
            });
            return optimisticItem;
        },
        updateItem: async (id: string, data: Record<string, unknown>) => {
            if (!isOffline()) {
                try {
                    return await request<any>(`/shopping/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
                } catch (error) {
                    if (!isOfflineError(error)) throw error;
                }
            }

            const lists = await request<any[]>('/shopping/lists');
            for (const list of lists) {
                const items = await readCachedShoppingItems(list.id);
                const item = items.find((cachedItem) => cachedItem.id === id);
                if (!item) continue;

                await markCachedItem(list.id, id, (cachedItem) => ({
                    ...cachedItem,
                    ...data,
                    pending_sync: true,
                    sync_error: null,
                }));

                const queuedCreate = await findQueuedCreate(id);
                if (queuedCreate) {
                    await putShoppingQueueEntry({
                        ...queuedCreate,
                        body: { ...queuedCreate.body, ...data },
                    });
                } else {
                    await enqueueShoppingOperation({
                        operation: 'update',
                        itemId: id,
                        listId: list.id,
                        body: data,
                    });
                }
                return { ...item, ...data, pending_sync: true, sync_error: null };
            }

            throw new Error('Item not found');
        },
        toggleComplete: async (id: string) => {
            if (!isOffline()) {
                try {
                    return await request<any>(`/shopping/items/${id}/complete`, { method: 'PATCH' });
                } catch (error) {
                    if (!isOfflineError(error)) throw error;
                }
            }

            const lists = await request<any[]>('/shopping/lists');
            for (const list of lists) {
                const items = await readCachedShoppingItems(list.id);
                const item = items.find((cachedItem) => cachedItem.id === id);
                if (!item) continue;

                const nextCompleted = !item.is_completed;
                const updatedItem = {
                    ...item,
                    is_completed: nextCompleted,
                    completed_at: nextCompleted ? new Date().toISOString() : null,
                    pending_sync: true,
                    sync_error: null,
                };
                await markCachedItem(list.id, id, () => updatedItem);
                await enqueueShoppingOperation({
                    operation: 'toggle',
                    itemId: id,
                    listId: list.id,
                });
                return updatedItem;
            }

            throw new Error('Item not found');
        },
        deleteItem: async (id: string) => {
            if (!isOffline()) {
                try {
                    return await request<any>(`/shopping/items/${id}`, { method: 'DELETE' });
                } catch (error) {
                    if (!isOfflineError(error)) throw error;
                }
            }

            const lists = await request<any[]>('/shopping/lists');
            for (const list of lists) {
                const items = await readCachedShoppingItems(list.id);
                const item = items.find((cachedItem) => cachedItem.id === id);
                if (!item) continue;

                await removeCachedItem(list.id, id);

                if (item.local_only) {
                    await removeQueuedEntriesForItem(id);
                    return { ok: true };
                }

                await enqueueShoppingOperation({
                    operation: 'delete',
                    itemId: id,
                    listId: list.id,
                });
                return { ok: true };
            }

            return request<any>(`/shopping/items/${id}`, { method: 'DELETE' });
        },
        reAddItem: (id: string) => request<any>(`/shopping/items/${id}/readd`, { method: 'POST' }),
    },
    calendar: {
        getEvents: (start: string, end: string) => request<any[]>(`/calendar?start=${start}&end=${end}`),
        createEvent: (data: object) => request<any>('/calendar', { method: 'POST', body: JSON.stringify(data) }),
        updateEvent: (id: string, data: object) => request<any>(`/calendar/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        deleteEvent: (id: string) => request<any>(`/calendar/${id}`, { method: 'DELETE' }),
    },
    chores: {
        getTemplates: () => request<any[]>('/chores/templates'),
        createTemplate: (data: object) => request<any>('/chores/templates', { method: 'POST', body: JSON.stringify(data) }),
        updateTemplate: (id: string, data: object) => request<any>(`/chores/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        deleteTemplate: (id: string) => request<any>(`/chores/templates/${id}`, { method: 'DELETE' }),
        getInstances: (start: string, end: string) => request<any[]>(`/chores/instances?start=${start}&end=${end}`),
        updateStatus: (id: string, status: string) =>
            request<any>(`/chores/instances/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
        deleteInstance: (id: string) => request<any>(`/chores/instances/${id}`, { method: 'DELETE' }),
        getStats: (start: string, end: string) => request<any[]>(`/chores/stats?start=${start}&end=${end}`),
    },
    meals: {
        getWeek: (start: string, end: string) => request<any[]>(`/meals?start=${start}&end=${end}`),
        addItem: (date: string, data: object) => request<any>(`/meals/${date}/items`, { method: 'POST', body: JSON.stringify(data) }),
        updateItem: (id: string, data: object) => request<any>(`/meals/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        deleteItem: (id: string) => request<any>(`/meals/items/${id}`, { method: 'DELETE' }),
        addToShopping: (date: string, listId: string, ingredients: string) =>
            request<any>(`/meals/${date}/add-to-shopping`, { method: 'POST', body: JSON.stringify({ list_id: listId, ingredients }) }),
        generateShoppingFromRange: (start: string, end: string, listId: string) =>
            request<any>('/meals/generate-shopping', { method: 'POST', body: JSON.stringify({ start, end, listId }) }),
    },
    recipes: {
        getAll: () => request<any[]>('/recipes'),
        getById: (id: string) => request<any>(`/recipes/${id}`),
        importFromUrl: (url: string) => request<any>('/recipes/import-from-url', { method: 'POST', body: JSON.stringify({ url }) }),
        save: (data: object) => request<any>('/recipes', { method: 'POST', body: JSON.stringify(data) }),
        update: (id: string, data: object) => request<any>(`/recipes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        delete: (id: string) => request<any>(`/recipes/${id}`, { method: 'DELETE' }),
        addToShoppingList: (recipeId: string, listId: string, ingredientIds: string[]) =>
            request<any>(`/recipes/${recipeId}/add-to-shopping-list`, { method: 'POST', body: JSON.stringify({ listId, ingredientIds }) }),
        createEnriched: (data: object) => request<any>('/recipes/create-enriched', { method: 'POST', body: JSON.stringify(data) }),
    },
    projects: {
        getAll: () => request<any[]>('/projects'),
        create: (data: object) => request<any>('/projects', { method: 'POST', body: JSON.stringify(data) }),
        update: (id: string, data: object) => request<any>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        delete: (id: string) => request<any>(`/projects/${id}`, { method: 'DELETE' }),
        getTasks: (projectId: string) => request<any[]>(`/projects/${projectId}/tasks`),
        createTask: (projectId: string, data: object) =>
            request<any>(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
        updateTask: (id: string, data: object) => request<any>(`/projects/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
        deleteTask: (id: string) => request<any>(`/projects/tasks/${id}`, { method: 'DELETE' }),
    },
    voice: {
        getConfig: () => request<{ apiKey: string; language: string; endpointing: string }>('/voice/config'),
        processShopping: (transcript: string) => request<VoiceEnvelope<{ items: any[] }>>('/voice/shopping', { method: 'POST', body: JSON.stringify({ transcript }) }),
        processRecipes: (transcript: string) => request<VoiceEnvelope<{ recipes: any[] }>>('/voice/recipes', { method: 'POST', body: JSON.stringify({ transcript }) }),
        processRecipeCommand: (transcript: string, recipeId: string) => request<VoiceEnvelope<{ modified: boolean; proposedRecipe?: any | null }>>('/voice/recipe-command', { method: 'POST', body: JSON.stringify({ transcript, recipeId }) }),
    },
};
