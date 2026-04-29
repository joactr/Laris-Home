import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendError } from '../lib/api-error';
import { createRateLimiter } from '../lib/rate-limit';
import { RecipeService } from '../services/recipe.service';

const router = Router();
router.use(authMiddleware);

const importRateLimiter = createRateLimiter({
  keyPrefix: 'recipes-import',
  windowMs: 60_000,
  max: 6,
  message: 'Has alcanzado el limite temporal de importaciones de recetas. Intentalo de nuevo en un minuto.',
});

const ImportSchema = z.object({
  url: z.string().url()
});

const RecipeSaveSchema = z.object({
  title: z.string(),
  description: z.string(),
  sourceUrl: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  imageUrl: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
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

const CreateEnrichedSchema = z.object({
  title: z.string(),
  ingredients: z.array(z.string()),
  instructions: z.string(),
  imageUrl: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
});

router.post('/import-from-url', importRateLimiter, async (req: AuthRequest, res: Response) => {
  const parsed = ImportSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'La URL de la receta no es valida.', parsed.error.flatten());
    return;
  }

  try {
    const recipe = await RecipeService.fetchAndParse(parsed.data.url);
    res.json(recipe);
  } catch (error) {
    sendError(res, 500, 'PROCESSING_FAILED', 'No se pudo importar la receta. Verifica la URL e intentalo de nuevo.');
  }
});

router.post('/create-enriched', async (req: AuthRequest, res: Response) => {
  const parsed = CreateEnrichedSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'La receta enriquecida no es valida.', parsed.error.flatten());
    return;
  }

  try {
    const householdId = req.user?.householdId;
    if (!householdId) {
      sendError(res, 400, 'BAD_REQUEST', 'Falta el household del usuario.');
      return;
    }

    const saved = await RecipeService.createEnrichedRecipe(householdId, parsed.data);
    res.json(saved);
  } catch {
    sendError(res, 500, 'PROCESSING_FAILED', 'Error al enriquecer y guardar la receta.');
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = RecipeSaveSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'La receta no es valida.', parsed.error.flatten());
    return;
  }

  try {
    const householdId = req.user?.householdId;
    if (!householdId) {
      sendError(res, 400, 'BAD_REQUEST', 'Falta el household del usuario.');
      return;
    }

    const saved = await RecipeService.saveRecipe(householdId, parsed.data);
    res.json(saved);
  } catch {
    sendError(res, 500, 'PROCESSING_FAILED', 'Error al guardar la receta.');
  }
});

router.post('/:id/add-to-shopping-list', async (req: AuthRequest, res: Response) => {
  const parsed = AddToShoppingSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'La seleccion de ingredientes no es valida.', parsed.error.flatten());
    return;
  }

  try {
    const added = await RecipeService.addIngredientsToShoppingList(
      req.user!.id,
      parsed.data.listId,
      parsed.data.ingredientIds
    );
    res.json(added);
  } catch {
    sendError(res, 500, 'PROCESSING_FAILED', 'Error al anadir ingredientes a la lista de la compra.');
  }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM recipes WHERE household_id = $1 ORDER BY created_at DESC',
      [req.user!.householdId]
    );
    res.json(result.rows);
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Error al obtener las recetas.');
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const recipeResult = await pool.query(
      'SELECT * FROM recipes WHERE id = $1 AND household_id = $2',
      [req.params.id, req.user!.householdId]
    );
    if (recipeResult.rows.length === 0) {
      sendError(res, 404, 'NOT_FOUND', 'Receta no encontrada.');
      return;
    }

    const recipe = recipeResult.rows[0];
    const ingredientsResult = await pool.query(
      'SELECT * FROM recipe_ingredients WHERE recipe_id = $1',
      [recipe.id]
    );
    recipe.ingredients = ingredientsResult.rows;
    res.json(recipe);
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Error al obtener la receta.');
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  const parsed = RecipeSaveSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'La receta no es valida.', parsed.error.flatten());
    return;
  }

  try {
    const householdId = req.user?.householdId;
    if (!householdId) {
      sendError(res, 400, 'BAD_REQUEST', 'Falta el household del usuario.');
      return;
    }

    const updated = await RecipeService.updateRecipe(householdId, req.params.id, parsed.data);
    res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Recipe not found')) {
      sendError(res, 404, 'NOT_FOUND', 'Receta no encontrada.');
      return;
    }
    sendError(res, 500, 'PROCESSING_FAILED', 'Error al actualizar la receta.');
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.user?.householdId;
    if (!householdId) {
      sendError(res, 400, 'BAD_REQUEST', 'Falta el household del usuario.');
      return;
    }
    await RecipeService.deleteRecipe(householdId, req.params.id);
    res.json({ success: true });
  } catch {
    sendError(res, 500, 'PROCESSING_FAILED', 'Error al eliminar la receta.');
  }
});

export default router;
