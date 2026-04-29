import type { ImportedRecipe, RecipeDraft, RecipeRecord } from '../../../shared/contracts';
import { request } from './client';

export const recipesApi = {
    getAll: (filters: Record<string, string | number | boolean | undefined> = {}) => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== '' && value !== false) params.set(key, String(value));
        });
        const query = params.toString();
        return request<RecipeRecord[]>(`/recipes${query ? `?${query}` : ''}`);
    },
    getById: (id: string) => request<RecipeRecord>(`/recipes/${id}`),
    getTags: () => request<Array<{ id: string; name: string }>>('/recipes/tags/all'),
    importFromUrl: (url: string) => request<ImportedRecipe>('/recipes/import-from-url', { method: 'POST', body: JSON.stringify({ url }) }),
    save: (data: RecipeDraft) => request<RecipeRecord>('/recipes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: RecipeDraft) => request<RecipeRecord>(`/recipes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<{ success: boolean }>(`/recipes/${id}`, { method: 'DELETE' }),
    addToShoppingList: (recipeId: string, listId: string, ingredientIds: string[]) =>
        request<unknown[]>(`/recipes/${recipeId}/add-to-shopping-list`, { method: 'POST', body: JSON.stringify({ listId, ingredientIds }) }),
    updatePreferences: (id: string, data: { isFavorite?: boolean; rating?: number | null }) =>
        request<{ is_favorite: boolean; my_rating: number | null }>(`/recipes/${id}/preferences`, { method: 'PUT', body: JSON.stringify(data) }),
    updateTags: (id: string, tags: string[]) =>
        request<Array<{ id: string; name: string }>>(`/recipes/${id}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) }),
    createEnriched: (data: { title: string; ingredients: string[]; instructions: string; imageUrl?: string | null }) =>
        request<RecipeRecord>('/recipes/create-enriched', { method: 'POST', body: JSON.stringify(data) }),
};
