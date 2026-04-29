import type { ImportedRecipe, RecipeDraft, RecipeRecord } from '../../../shared/contracts';
import { request } from './client';

export const recipesApi = {
    getAll: () => request<RecipeRecord[]>('/recipes'),
    getById: (id: string) => request<RecipeRecord>(`/recipes/${id}`),
    importFromUrl: (url: string) => request<ImportedRecipe>('/recipes/import-from-url', { method: 'POST', body: JSON.stringify({ url }) }),
    save: (data: RecipeDraft) => request<RecipeRecord>('/recipes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: RecipeDraft) => request<RecipeRecord>(`/recipes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<{ success: boolean }>(`/recipes/${id}`, { method: 'DELETE' }),
    addToShoppingList: (recipeId: string, listId: string, ingredientIds: string[]) =>
        request<unknown[]>(`/recipes/${recipeId}/add-to-shopping-list`, { method: 'POST', body: JSON.stringify({ listId, ingredientIds }) }),
    createEnriched: (data: { title: string; ingredients: string[]; instructions: string; imageUrl?: string | null }) =>
        request<RecipeRecord>('/recipes/create-enriched', { method: 'POST', body: JSON.stringify(data) }),
};
