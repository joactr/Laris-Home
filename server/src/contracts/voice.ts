import { z } from 'zod';

export const transcriptSchema = z.object({
  transcript: z.string().min(1),
  recipeId: z.string().optional(),
});

export const voiceShoppingResultSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().min(1),
      quantity: z.number().finite(),
    })
  ),
  message: z.string().default(''),
});

export const voiceRecipeSuggestionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  ingredients: z.array(z.string()),
  instructions: z.string(),
  time: z.string(),
  image: z.string().default(''),
});

export const voiceRecipesResultSchema = z.object({
  recipes: z.array(voiceRecipeSuggestionSchema),
  message: z.string().default(''),
});

export const parsedIngredientSchema = z.object({
  name: z.string().min(1),
  originalText: z.string().min(1),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const parsedRecipeSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  servings: z.number().nullable().optional(),
  prepTimeMinutes: z.number().nullable().optional(),
  cookTimeMinutes: z.number().nullable().optional(),
  caloriesPerServing: z.number().nullable().optional(),
  proteinPerServing: z.number().nullable().optional(),
  carbsPerServing: z.number().nullable().optional(),
  fatPerServing: z.number().nullable().optional(),
  ingredients: z.array(parsedIngredientSchema),
  instructions: z.array(z.string()),
});

export const recipeCommandResultSchema = z.object({
  message: z.string().default(''),
  modifiedRecipe: parsedRecipeSchema.nullish(),
});
