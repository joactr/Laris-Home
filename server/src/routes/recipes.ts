import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { RecipeService } from '../services/recipe.service';

const router = Router();
router.use(authMiddleware);

const ImportSchema = z.object({
  url: z.string().url()
});

const RecipeSaveSchema = z.object({
  title: z.string(),
  description: z.string(),
  sourceUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  imageUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  servings: z.number().nullable().optional(),
  prepTimeMinutes: z.number().nullable().optional(),
  cookTimeMinutes: z.number().nullable().optional(),
  caloriesPerServing: z.number().nullable().optional(),
  proteinPerServing: z.number().nullable().optional(),
  carbsPerServing: z.number().nullable().optional(),
  fatPerServing: z.number().nullable().optional(),
  ingredients: z.array(z.object({
    name: z.string(),
    originalText: z.string(),
    quantity: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })),
  instructions: z.array(z.string())
});

const AddToShoppingSchema = z.object({
  listId: z.string().uuid(),
  ingredientIds: z.array(z.string().uuid())
});

// Import recipe from URL
router.post('/import-from-url', async (req: AuthRequest, res: Response) => {
  const parsed = ImportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const recipe = await RecipeService.fetchAndParse(parsed.data.url);
    res.json(recipe);
  } catch (err: any) {
    console.error('Import Error:', err);
    res.status(500).json({ error: 'No se pudo importar la receta. Verifique la URL e inténtelo de nuevo.' });
  }
});

const CreateEnrichedSchema = z.object({
  title: z.string(),
  ingredients: z.array(z.string()),
  instructions: z.string(),
  imageUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
});

// Create enriched recipe
router.post('/create-enriched', async (req: AuthRequest, res: Response) => {
  const parsed = CreateEnrichedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const householdId = req.user?.householdId;
    if (!householdId) {
      res.status(400).json({ error: 'Household ID missing from user session' });
      return;
    }
    const saved = await RecipeService.createEnrichedRecipe(householdId, parsed.data);
    res.json(saved);
  } catch (err: any) {
    console.error('Enrichment/Save Error:', err);
    res.status(500).json({ error: 'Error al enriquecer y guardar la receta.' });
  }
});

// Save recipe
router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = RecipeSaveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const householdId = req.user?.householdId;
    if (!householdId) {
      res.status(400).json({ error: 'Household ID missing from user session' });
      return;
    }
    const saved = await RecipeService.saveRecipe(householdId, parsed.data);
    res.json(saved);
  } catch (err: any) {
    console.error('Save Error:', err);
    res.status(500).json({ error: 'Error al guardar la receta.' });
  }
});

// Add ingredients to shopping list
router.post('/:id/add-to-shopping-list', async (req: AuthRequest, res: Response) => {
  const parsed = AddToShoppingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const added = await RecipeService.addIngredientsToShoppingList(
      req.user!.id,
      parsed.data.listId,
      parsed.data.ingredientIds
    );
    res.json(added);
  } catch (err: any) {
    console.error('Shopping List Error:', err);
    res.status(500).json({ error: 'Error al añadir ingredientes a la lista de la compra.' });
  }
});

// Get recipes for household
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM recipes WHERE household_id = $1 ORDER BY created_at DESC',
      [req.user!.householdId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Error al obtener las recetas.' });
  }
});

// Get single recipe
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const recipeResult = await pool.query(
      'SELECT * FROM recipes WHERE id = $1 AND household_id = $2',
      [req.params.id, req.user!.householdId]
    );
    if (recipeResult.rows.length === 0) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    const recipe = recipeResult.rows[0];
    const ingredientsResult = await pool.query(
      'SELECT * FROM recipe_ingredients WHERE recipe_id = $1',
      [recipe.id]
    );
    recipe.ingredients = ingredientsResult.rows;
    res.json(recipe);
  } catch (err: any) {
    res.status(500).json({ error: 'Error al obtener la receta.' });
  }
});

// Update recipe
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const parsed = RecipeSaveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const householdId = req.user?.householdId;
    if (!householdId) {
      res.status(400).json({ error: 'Household ID missing from user session' });
      return;
    }
    const updated = await RecipeService.updateRecipe(householdId, req.params.id, parsed.data as any);
    res.json(updated);
  } catch (err: any) {
    console.error('Update Error:', err);
    res.status(500).json({ error: 'Error al actualizar la receta.' });
  }
});

// Delete recipe
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.user?.householdId;
    if (!householdId) {
      res.status(400).json({ error: 'Household ID missing from user session' });
      return;
    }
    await RecipeService.deleteRecipe(householdId, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Delete Error:', err);
    res.status(500).json({ error: 'Error al eliminar la receta.' });
  }
});

export default router;
