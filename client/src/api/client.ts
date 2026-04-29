import { useAuthStore } from '../store/auth';
import { useOfflineStore } from '../store/offline';
import type {
    ApiErrorPayload,
    AuthUser,
    CalendarEvent,
    DashboardPayload,
    DashboardSummary,
    LoginResponse,
    VoiceRecipeCommandProposal,
    VoiceShoppingItem,
    VoiceEnvelope,
    VoiceRecipeSuggestion,
    VoiceTranscriptionResponse,
} from '../../../shared/contracts';
import {
    createOfflineId,
    getCachedValue,
    getScopeFromUser,
    getShoppingItemsPath,
    listOfflineMutationEntries,
    listScopedCacheEntries,
    listShoppingQueueEntries,
    putShoppingQueueEntry,
    putOfflineMutationEntry,
    deleteShoppingQueueEntry,
    deleteOfflineMutationEntry,
    replaceShoppingQueueItemId,
    setCachedValue,
    type OfflineMutationEntry,
    type ShoppingQueueEntry,
} from '../services/offline.service';

const BASE = '/api';

type RequestConfig = {
    bypassOfflineGuard?: boolean;
};

export class ApiClientError extends Error {
    readonly code: string;
    readonly status?: number;
    readonly details?: unknown;

    constructor(message: string, code = 'UNKNOWN_ERROR', status?: number, details?: unknown) {
        super(message);
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

function getToken() {
    return useAuthStore.getState().token;
}

function getCurrentUser() {
    return useAuthStore.getState().user;
}

export function getCurrentScope() {
    return getScopeFromUser(getCurrentUser());
}

export function isOffline() {
    return typeof navigator !== 'undefined' && !navigator.onLine;
}

export function isOfflineError(error: unknown) {
    return error instanceof TypeError || (error instanceof Error && error.message === 'OFFLINE_UNAVAILABLE');
}

function shouldCacheGet(path: string) {
    return (
        path === '/dashboard' ||
        path === '/dashboard/summary' ||
        path === '/shopping/lists' ||
        /^\/shopping\/lists\/[^/]+\/items$/.test(path) ||
        path.startsWith('/calendar?') ||
        path.startsWith('/chores/instances?') ||
        path.startsWith('/chores/stats?') ||
        path.startsWith('/meals?') ||
        path === '/recipes' ||
        /^\/recipes\/[^/]+$/.test(path)
    );
}

function getCachedPath(path: string) {
    return shouldCacheGet(path) ? path : null;
}

function hasPendingOfflineState(value: unknown): boolean {
    if (Array.isArray(value)) {
        return value.some((item) => hasPendingOfflineState(item));
    }

    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    if (candidate.pending_sync || candidate.local_only || candidate.sync_error) {
        return true;
    }

    return Object.values(candidate).some((nested) => hasPendingOfflineState(nested));
}

function stripTime(value: string | null | undefined) {
    return String(value || '').slice(0, 10);
}

function getRangeParams(path: string) {
    const query = path.split('?')[1];
    if (!query) return null;
    const params = new URLSearchParams(query);
    const start = params.get('start');
    const end = params.get('end');
    if (!start || !end) return null;
    return {
        start,
        end,
        startDate: stripTime(start),
        endDate: stripTime(end),
    };
}

function isDateWithinPathRange(path: string, dateValue: string | null | undefined) {
    if (!dateValue) return false;
    const range = getRangeParams(path);
    if (!range) return true;
    const date = stripTime(dateValue);
    return date >= range.startDate && date <= range.endDate;
}

function sortEvents(items: any[]) {
    return [...items].sort((a, b) => +new Date(a.start_datetime) - +new Date(b.start_datetime));
}

function sortChores(items: any[]) {
    return [...items].sort((a, b) => {
        const dateDiff = stripTime(a.scheduled_date).localeCompare(stripTime(b.scheduled_date));
        if (dateDiff !== 0) return dateDiff;
        return String(a.title || '').localeCompare(String(b.title || ''));
    });
}

function sortMeals(items: any[]) {
    const order: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
    return [...items].sort((a, b) => (order[a.meal_type] ?? 99) - (order[b.meal_type] ?? 99));
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

    if (method === 'GET' && cachePath) {
        const cached = await getCachedValue<T>(scope, cachePath);
        if (cached !== undefined && hasPendingOfflineState(cached)) {
            return cached;
        }
    }

    const headers = new Headers(options.headers || {});
    const shouldSetJsonHeader = !headers.has('Content-Type')
        && options.body != null
        && !(options.body instanceof FormData)
        && !(options.body instanceof Blob)
        && !(options.body instanceof ArrayBuffer);

    if (shouldSetJsonHeader) {
        headers.set('Content-Type', 'application/json');
    }

    if (shouldAttachAuth) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    try {
        const res = await fetch(`${BASE}${path}`, {
            ...options,
            headers,
            body: options.body,
        });

        if (res.status === 401 && shouldAttachAuth) {
            useAuthStore.getState().logout();
            throw new Error('TOKEN_EXPIRED');
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: { message: res.statusText, code: 'UNKNOWN_ERROR' } })) as ApiErrorPayload | { error?: string };
            if (err && typeof err === 'object' && 'error' in err && err.error && typeof err.error === 'object') {
                const payload = err as ApiErrorPayload;
                throw new ApiClientError(
                    payload.error.message || 'Request failed',
                    payload.error.code || 'UNKNOWN_ERROR',
                    res.status,
                    payload.error.details
                );
            }

            const legacyMessage = typeof err.error === 'string' ? err.error : res.statusText;
            throw new ApiClientError(legacyMessage || 'Request failed', 'UNKNOWN_ERROR', res.status);
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
    const scope = getCurrentScope();
    const [shoppingEntries, mutationEntries] = await Promise.all([
        listShoppingQueueEntries(scope),
        listOfflineMutationEntries(scope),
    ]);
    useOfflineStore.getState().setPendingCount(shoppingEntries.length + mutationEntries.length);
}

async function updateCachedCollections(prefix: string, updater: (path: string, value: any) => any) {
    const scope = getCurrentScope();
    const entries = await listScopedCacheEntries<any>(scope, prefix);
    await Promise.all(entries.map((entry) => setCachedValue(scope, entry.path, updater(entry.path, entry.value))));
}

export async function enqueueOfflineMutation(entry: Omit<OfflineMutationEntry, 'id' | 'scope' | 'createdAt'>) {
    await putOfflineMutationEntry({
        ...entry,
        id: createOfflineId(`${entry.resource}_queue`),
        scope: getCurrentScope(),
        createdAt: Date.now(),
    });
    await updatePendingCount();
}

export function buildOptimisticEvent(data: Record<string, unknown>, id = createOfflineId('calendar_event')) {
    return {
        id,
        title: String(data.title || '').trim(),
        description: data.description ?? null,
        start_datetime: String(data.start_datetime || ''),
        end_datetime: String(data.end_datetime || ''),
        assigned_user_id: data.assigned_user_id ?? null,
        category: data.category ?? 'shared',
        recurrence: data.recurrence ?? null,
        created_by_name: getCurrentUser()?.name,
        created_by_color: getCurrentUser()?.color,
        pending_sync: true,
        sync_error: null,
        local_only: true,
    };
}

export async function upsertCachedCalendarEvent(nextEvent: CalendarEvent, previousEvent?: CalendarEvent) {
    await updateCachedCollections('/calendar?', (path, value) => {
        const current = Array.isArray(value) ? value : [];
        const previousInRange = previousEvent && isDateWithinPathRange(path, previousEvent.start_datetime);
        const nextInRange = isDateWithinPathRange(path, nextEvent.start_datetime);
        const withoutCurrent = current.filter((item: any) => item.id !== nextEvent.id);

        if (!nextInRange && !previousInRange) {
            return current;
        }

        if (!nextInRange) {
            return sortEvents(withoutCurrent);
        }

        return sortEvents([
            ...withoutCurrent,
            {
                ...nextEvent,
                pending_sync: nextEvent.pending_sync ?? false,
                sync_error: nextEvent.sync_error ?? null,
                local_only: nextEvent.local_only ?? false,
            },
        ]);
    });
}

export async function removeCachedCalendarEvent(eventId: string) {
    await updateCachedCollections('/calendar?', (_path, value) => {
        const current = Array.isArray(value) ? value : [];
        return current.filter((item: any) => item.id !== eventId);
    });
}

async function replaceCachedCalendarEventId(oldId: string, nextEvent: any) {
    await updateCachedCollections('/calendar?', (_path, value) => {
        const current = Array.isArray(value) ? value : [];
        return sortEvents(current.map((item: any) => (
            item.id === oldId
                ? { ...nextEvent, pending_sync: false, sync_error: null, local_only: false }
                : item
        )));
    });
}

async function upsertCachedChore(nextChore: any) {
    await updateCachedCollections('/chores/instances?', (path, value) => {
        const current = Array.isArray(value) ? value : [];
        const inRange = isDateWithinPathRange(path, nextChore.scheduled_date);
        const withoutCurrent = current.filter((item: any) => item.id !== nextChore.id);
        if (!inRange) return current;
        return sortChores([
            ...withoutCurrent,
            {
                ...nextChore,
                pending_sync: nextChore.pending_sync ?? false,
                sync_error: nextChore.sync_error ?? null,
            },
        ]);
    });
}

async function removeCachedChore(choreId: string) {
    await updateCachedCollections('/chores/instances?', (_path, value) => {
        const current = Array.isArray(value) ? value : [];
        return current.filter((item: any) => item.id !== choreId);
    });
}

async function updateCachedChoreStats(chore: any, previousStatus?: string) {
    if (!chore?.assigned_user_id) return;

    await updateCachedCollections('/chores/stats?', (path, value) => {
        if (!isDateWithinPathRange(path, chore.scheduled_date)) {
            return value;
        }

        const current = Array.isArray(value) ? [...value] : [];
        const index = current.findIndex((item: any) => item.id === chore.assigned_user_id);
        const wasDone = previousStatus === 'done';
        const isDoneNow = chore.status === 'done';
        if (wasDone === isDoneNow) return current;

        const deltaCompleted = isDoneNow ? 1 : -1;
        const deltaPoints = isDoneNow ? Number(chore.points) || 0 : -(Number(chore.points) || 0);

        if (index === -1) {
            if (!isDoneNow) return current;
            return [
                ...current,
                {
                    id: chore.assigned_user_id,
                    name: chore.assigned_name || 'Sin asignar',
                    color: chore.assigned_color || '#94a3b8',
                    completed: 1,
                    points: Math.max(deltaPoints, 0),
                },
            ];
        }

        const currentStat = current[index];
        current[index] = {
            ...currentStat,
            completed: Math.max(0, Number(currentStat.completed || 0) + deltaCompleted),
            points: Math.max(0, Number(currentStat.points || 0) + deltaPoints),
        };
        return current;
    });
}

function buildOptimisticMealItem(date: string, data: Record<string, unknown>, id = createOfflineId('meal_item')) {
    return {
        id,
        date,
        meal_type: data.meal_type,
        recipe_id: data.recipe_id ?? null,
        text_content: data.text_content ?? null,
        servings: data.servings ?? 1,
        recipe_title: data.text_content ?? null,
        recipe_image_url: null,
        prep_time_minutes: null,
        cook_time_minutes: null,
        calories_per_serving: null,
        protein_per_serving: null,
        carbs_per_serving: null,
        fat_per_serving: null,
        pending_sync: true,
        sync_error: null,
        local_only: true,
    };
}

async function upsertCachedMealItem(date: string, nextItem: any) {
    await updateCachedCollections('/meals?', (path, value) => {
        if (!isDateWithinPathRange(path, date)) {
            return value;
        }

        const current = Array.isArray(value) ? [...value] : [];
        const dateKey = stripTime(date);
        const dayIndex = current.findIndex((day: any) => stripTime(day.date) === dateKey);
        const nextEntry = {
            ...nextItem,
            pending_sync: nextItem.pending_sync ?? false,
            sync_error: nextItem.sync_error ?? null,
            local_only: nextItem.local_only ?? false,
        };

        if (dayIndex === -1) {
            return [...current, { date, items: [nextEntry] }];
        }

        const day = current[dayIndex];
        const items = Array.isArray(day.items) ? day.items : [];
        current[dayIndex] = {
            ...day,
            items: sortMeals([
                ...items.filter((item: any) => item.id !== nextItem.id),
                nextEntry,
            ]),
        };
        return current;
    });
}

async function removeCachedMealItem(itemId: string) {
    await updateCachedCollections('/meals?', (_path, value) => {
        const current = Array.isArray(value) ? [...value] : [];
        return current
            .map((day: any) => ({
                ...day,
                items: (Array.isArray(day.items) ? day.items : []).filter((item: any) => item.id !== itemId),
            }))
            .filter((day: any) => Array.isArray(day.items) && day.items.length > 0);
    });
}

async function replaceCachedMealItemId(oldId: string, nextItem: any) {
    await updateCachedCollections('/meals?', (_path, value) => {
        const current = Array.isArray(value) ? [...value] : [];
        return current.map((day: any) => ({
            ...day,
            items: sortMeals((Array.isArray(day.items) ? day.items : []).map((item: any) => (
                item.id === oldId
                    ? { ...item, ...nextItem, pending_sync: false, sync_error: null, local_only: false }
                    : item
            ))),
        }));
    });
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

async function syncOfflineMutationQueue() {
    if (isOffline() || !getToken()) {
        return;
    }

    const scope = getCurrentScope();
    const entries = await listOfflineMutationEntries(scope);

    for (const entry of entries) {
        try {
            if (entry.resource === 'calendar') {
                if (entry.operation === 'create') {
                    const created = await rawRequest<any>(
                        entry.path,
                        { method: entry.method, body: JSON.stringify(entry.body || {}) },
                        { bypassOfflineGuard: true }
                    );
                    await replaceCachedCalendarEventId(entry.entityId, created);
                } else if (entry.operation === 'update') {
                    const updated = await rawRequest<any>(
                        entry.path,
                        { method: entry.method, body: JSON.stringify(entry.body || {}) },
                        { bypassOfflineGuard: true }
                    );
                    await upsertCachedCalendarEvent({ ...updated, pending_sync: false, sync_error: null, local_only: false });
                } else if (entry.operation === 'delete') {
                    await rawRequest<any>(entry.path, { method: entry.method }, { bypassOfflineGuard: true });
                    await removeCachedCalendarEvent(entry.entityId);
                }
            }

            if (entry.resource === 'chores') {
                if (entry.operation === 'status') {
                    const updated = await rawRequest<any>(
                        entry.path,
                        { method: entry.method, body: JSON.stringify(entry.body || {}) },
                        { bypassOfflineGuard: true }
                    );

                    const cachedEntries = await listScopedCacheEntries<any[]>(scope, '/chores/instances?');
                    const previousChore = cachedEntries
                        .flatMap((cacheEntry) => cacheEntry.value || [])
                        .find((item: any) => item.id === entry.entityId);
                    const merged = {
                        ...(previousChore || {}),
                        ...updated,
                        pending_sync: false,
                        sync_error: null,
                    };

                    await upsertCachedChore(merged);
                    await updateCachedChoreStats(merged, previousChore?.status);
                } else if (entry.operation === 'delete') {
                    await rawRequest<any>(entry.path, { method: entry.method }, { bypassOfflineGuard: true });
                    await removeCachedChore(entry.entityId);
                }
            }

            if (entry.resource === 'meals') {
                if (entry.operation === 'create') {
                    const created = await rawRequest<any>(
                        entry.path,
                        { method: entry.method, body: JSON.stringify(entry.body || {}) },
                        { bypassOfflineGuard: true }
                    );
                    await replaceCachedMealItemId(entry.entityId, created);
                } else if (entry.operation === 'update') {
                    const updated = await rawRequest<any>(
                        entry.path,
                        { method: entry.method, body: JSON.stringify(entry.body || {}) },
                        { bypassOfflineGuard: true }
                    );
                    const cachedEntries = await listScopedCacheEntries<any[]>(scope, '/meals?');
                    const previousItem = cachedEntries
                        .flatMap((cacheEntry) => cacheEntry.value || [])
                        .flatMap((day: any) => day.items || [])
                        .find((item: any) => item.id === entry.entityId);
                    await upsertCachedMealItem(previousItem?.date || stripTime(updated.date || ''), {
                        ...(previousItem || {}),
                        ...updated,
                        pending_sync: false,
                        sync_error: null,
                        local_only: false,
                    });
                } else if (entry.operation === 'delete') {
                    await rawRequest<any>(entry.path, { method: entry.method }, { bypassOfflineGuard: true });
                    await removeCachedMealItem(entry.entityId);
                }
            }

            await deleteOfflineMutationEntry(entry.id);
        } catch (error) {
            if (!isOfflineError(error)) {
                await deleteOfflineMutationEntry(entry.id);
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
    void syncOfflineMutationQueue();

    window.addEventListener('online', () => {
        useOfflineStore.getState().setIsOffline(false);
        void syncShoppingQueue();
        void syncOfflineMutationQueue();
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
        await syncOfflineMutationQueue();
    }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    return rawRequest<T>(path, options);
}

export const shoppingApi = {
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
};

export const choresApi = {
        getTemplates: () => request<any[]>('/chores/templates'),
        createTemplate: (data: object) => request<any>('/chores/templates', { method: 'POST', body: JSON.stringify(data) }),
        updateTemplate: (id: string, data: object) => request<any>(`/chores/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        deleteTemplate: (id: string) => request<any>(`/chores/templates/${id}`, { method: 'DELETE' }),
        getInstances: (start: string, end: string) => request<any[]>(`/chores/instances?start=${start}&end=${end}`),
        updateStatus: async (id: string, status: string) => {
            const cachedEntries = await listScopedCacheEntries<any[]>(getCurrentScope(), '/chores/instances?');
            const previousChore = cachedEntries
                .flatMap((entry) => entry.value || [])
                .find((item: any) => item.id === id);

            if (!isOffline()) {
                try {
                    const updated = await request<any>(`/chores/instances/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
                    const merged = { ...(previousChore || {}), ...updated };
                    await upsertCachedChore(merged);
                    await updateCachedChoreStats(merged, previousChore?.status);
                    return merged;
                } catch (error) {
                    if (!isOfflineError(error)) throw error;
                }
            }

            if (!previousChore) {
                throw new Error('Tarea no encontrada en caché');
            }

            const optimisticChore = {
                ...previousChore,
                status,
                completed_at: status === 'done' ? new Date().toISOString() : null,
                pending_sync: true,
                sync_error: null,
            };
            await upsertCachedChore(optimisticChore);
            await updateCachedChoreStats(optimisticChore, previousChore.status);
            await enqueueOfflineMutation({
                resource: 'chores',
                operation: 'status',
                entityId: id,
                path: `/chores/instances/${id}/status`,
                method: 'PATCH',
                body: { status },
            });
            return optimisticChore;
        },
        deleteInstance: async (id: string) => {
            if (!isOffline()) {
                try {
                    const result = await request<any>(`/chores/instances/${id}`, { method: 'DELETE' });
                    await removeCachedChore(id);
                    return result;
                } catch (error) {
                    if (!isOfflineError(error)) throw error;
                }
            }

            await removeCachedChore(id);
            await enqueueOfflineMutation({
                resource: 'chores',
                operation: 'delete',
                entityId: id,
                path: `/chores/instances/${id}`,
                method: 'DELETE',
            });
            return { ok: true, offline: true };
        },
        getStats: (start: string, end: string) => request<any[]>(`/chores/stats?start=${start}&end=${end}`),
};

export const mealsApi = {
        getWeek: (start: string, end: string) => request<any[]>(`/meals?start=${start}&end=${end}`),
        addItem: async (date: string, data: Record<string, unknown>) => {
            if (!isOffline()) {
                try {
                    const created = await request<any>(`/meals/${date}/items`, { method: 'POST', body: JSON.stringify(data) });
                    await upsertCachedMealItem(date, created);
                    return created;
                } catch (error) {
                    if (!isOfflineError(error)) throw error;
                }
            }

            const optimisticItem = buildOptimisticMealItem(date, data);
            await upsertCachedMealItem(date, optimisticItem);
            await enqueueOfflineMutation({
                resource: 'meals',
                operation: 'create',
                entityId: optimisticItem.id,
                path: `/meals/${date}/items`,
                method: 'POST',
                body: data,
            });
            return optimisticItem;
        },
        updateItem: async (id: string, data: Record<string, unknown>) => {
            const cachedEntries = await listScopedCacheEntries<any[]>(getCurrentScope(), '/meals?');
            const previousItem = cachedEntries
                .flatMap((entry) => entry.value || [])
                .flatMap((day: any) => day.items || [])
                .find((item: any) => item.id === id);

            if (!isOffline()) {
                try {
                    const updated = await request<any>(`/meals/items/${id}`, { method: 'PUT', body: JSON.stringify(data) });
                    await upsertCachedMealItem(previousItem?.date || stripTime(updated.date || ''), {
                        ...(previousItem || {}),
                        ...updated,
                    });
                    return updated;
                } catch (error) {
                    if (!isOfflineError(error)) throw error;
                }
            }

            if (!previousItem) {
                throw new Error('Comida no encontrada en caché');
            }

            const optimisticItem = {
                ...previousItem,
                ...data,
                pending_sync: true,
                sync_error: null,
            };
            await upsertCachedMealItem(previousItem.date, optimisticItem);
            await enqueueOfflineMutation({
                resource: 'meals',
                operation: 'update',
                entityId: id,
                path: `/meals/items/${id}`,
                method: 'PUT',
                body: data,
            });
            return optimisticItem;
        },
        deleteItem: async (id: string) => {
            if (!isOffline()) {
                try {
                    const result = await request<any>(`/meals/items/${id}`, { method: 'DELETE' });
                    await removeCachedMealItem(id);
                    return result;
                } catch (error) {
                    if (!isOfflineError(error)) throw error;
                }
            }

            await removeCachedMealItem(id);
            await enqueueOfflineMutation({
                resource: 'meals',
                operation: 'delete',
                entityId: id,
                path: `/meals/items/${id}`,
                method: 'DELETE',
            });
            return { ok: true, offline: true };
        },
        addToShopping: (date: string, listId: string, ingredients: string) =>
            request<any>(`/meals/${date}/add-to-shopping`, { method: 'POST', body: JSON.stringify({ list_id: listId, ingredients }) }),
        generateShoppingFromRange: (start: string, end: string, listId: string) =>
            request<any>('/meals/generate-shopping', { method: 'POST', body: JSON.stringify({ start, end, listId }) }),
};

export const voiceApi = {
        getConfig: () => request<{ providerConfigured: boolean; language: string }>('/voice/config'),
        transcribe: (audio: Blob) =>
            request<VoiceTranscriptionResponse>('/voice/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': audio.type || 'audio/webm' },
                body: audio,
            }),
        processShopping: (transcript: string) => request<VoiceEnvelope<{ items: VoiceShoppingItem[] }>>('/voice/shopping', { method: 'POST', body: JSON.stringify({ transcript }) }),
        processRecipes: (transcript: string) => request<VoiceEnvelope<{ recipes: VoiceRecipeSuggestion[] }>>('/voice/recipes', { method: 'POST', body: JSON.stringify({ transcript }) }),
        processRecipeCommand: (transcript: string, recipeId: string) => request<VoiceEnvelope<{ modified: boolean; proposedRecipe?: VoiceRecipeCommandProposal | null }>>('/voice/recipe-command', { method: 'POST', body: JSON.stringify({ transcript, recipeId }) }),
};
