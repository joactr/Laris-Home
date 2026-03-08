import { useAuthStore } from '../store/auth';

const BASE = '/api';

function getToken() {
    return useAuthStore.getState().token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = getToken();
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers,
        },
        body: options.body,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        const errMsg = typeof err.error === 'string'
            ? err.error
            : JSON.stringify(err.error ?? err);
        throw new Error(errMsg || 'Request failed');
    }
    return res.json();
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
        getItems: (listId: string) => request<any[]>(`/shopping/lists/${listId}/items`),
        addItem: (listId: string, data: object) =>
            request<any>(`/shopping/lists/${listId}/items`, { method: 'POST', body: JSON.stringify(data) }),
        updateItem: (id: string, data: object) =>
            request<any>(`/shopping/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
        toggleComplete: (id: string) => request<any>(`/shopping/items/${id}/complete`, { method: 'PATCH' }),
        deleteItem: (id: string) => request<any>(`/shopping/items/${id}`, { method: 'DELETE' }),
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
        updateDay: (date: string, data: object) => request<any>(`/meals/${date}`, { method: 'PUT', body: JSON.stringify(data) }),
        addToShopping: (date: string, listId: string, ingredients: string) =>
            request<any>(`/meals/${date}/add-to-shopping`, { method: 'POST', body: JSON.stringify({ list_id: listId, ingredients }) }),
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
        processShopping: (transcript: string) => request<any>('/voice/shopping', { method: 'POST', body: JSON.stringify({ transcript }) }),
        processRecipes: (transcript: string) => request<any>('/voice/recipes', { method: 'POST', body: JSON.stringify({ transcript }) }),
    },
};
