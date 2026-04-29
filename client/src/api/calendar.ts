import { listScopedCacheEntries } from '../services/offline.service';
import type { CalendarEvent, CalendarEventInput } from '../../../shared/contracts';
import {
    buildOptimisticEvent,
    enqueueOfflineMutation,
    getCurrentScope,
    isOffline,
    isOfflineError,
    removeCachedCalendarEvent,
    request,
    upsertCachedCalendarEvent,
} from './client';

export const calendarApi = {
    getEvents: (start: string, end: string) => request<CalendarEvent[]>(`/calendar?start=${start}&end=${end}`),
    createEvent: async (data: CalendarEventInput) => {
        if (!isOffline()) {
            try {
                const created = await request<CalendarEvent>('/calendar', { method: 'POST', body: JSON.stringify(data) });
                await upsertCachedCalendarEvent(created);
                return created;
            } catch (error) {
                if (!isOfflineError(error)) throw error;
            }
        }

        const optimisticEvent = buildOptimisticEvent(data as unknown as Record<string, unknown>) as CalendarEvent;
        await upsertCachedCalendarEvent(optimisticEvent);
        await enqueueOfflineMutation({
            resource: 'calendar',
            operation: 'create',
            entityId: optimisticEvent.id,
            path: '/calendar',
            method: 'POST',
            body: data,
        });
        return optimisticEvent;
    },
    updateEvent: async (id: string, data: Partial<CalendarEventInput>) => {
        const cachedEntries = await listScopedCacheEntries<CalendarEvent[]>(getCurrentScope(), '/calendar?');
        const previousEvent = cachedEntries
            .flatMap((entry) => entry.value || [])
            .find((item) => item.id === id);

        if (!isOffline()) {
            try {
                const updated = await request<CalendarEvent>(`/calendar/${id}`, { method: 'PUT', body: JSON.stringify(data) });
                await upsertCachedCalendarEvent(updated, previousEvent);
                return updated;
            } catch (error) {
                if (!isOfflineError(error)) throw error;
            }
        }

        const optimisticEvent: CalendarEvent = {
            ...(previousEvent || (buildOptimisticEvent(data as Record<string, unknown>, id) as CalendarEvent)),
            ...data,
            id,
            pending_sync: true,
            sync_error: null,
            local_only: previousEvent?.local_only ?? false,
        };
        await upsertCachedCalendarEvent(optimisticEvent, previousEvent);
        await enqueueOfflineMutation({
            resource: 'calendar',
            operation: 'update',
            entityId: id,
            path: `/calendar/${id}`,
            method: 'PUT',
            body: data,
        });
        return optimisticEvent;
    },
    deleteEvent: async (id: string) => {
        if (!isOffline()) {
            try {
                const result = await request<{ ok: boolean }>(`/calendar/${id}`, { method: 'DELETE' });
                await removeCachedCalendarEvent(id);
                return result;
            } catch (error) {
                if (!isOfflineError(error)) throw error;
            }
        }

        await removeCachedCalendarEvent(id);
        await enqueueOfflineMutation({
            resource: 'calendar',
            operation: 'delete',
            entityId: id,
            path: `/calendar/${id}`,
            method: 'DELETE',
        });
        return { ok: true, offline: true };
    },
};
