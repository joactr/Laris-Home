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

const PreferencesSchema = z.object({
  isFavorite: z.boolean().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
});

const TagsSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(80)).max(12),
});

function normalizeTagName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getRecipeIngredients(recipeId: string) {
  const ingredientsResult = await pool.query(
    'SELECT * FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY name',
    [recipeId]
  );
  return ingredientsResult.rows;
}

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
    const params = req.query;
    const values: unknown[] = [req.user!.householdId, req.user!.id];
    const where = ['r.household_id = $1'];
    const tagFilters = String(params.tags || '')
      .split(',')
      .map((tag) => normalizeTagName(tag))
      .filter(Boolean);

    if (params.search) {
      values.push(`%${String(params.search).toLowerCase()}%`);
      where.push(`(lower(r.title) LIKE $${values.length} OR lower(COALESCE(r.description, '')) LIKE $${values.length})`);
    }
    if (params.favorite === 'true') {
      where.push('COALESCE(rup.is_favorite, false) = true');
    }
    if (params.minRating) {
      values.push(Number(params.minRating));
      where.push(`rup.rating >= $${values.length}`);
    }
    if (params.maxMinutes) {
      values.push(Number(params.maxMinutes));
      where.push(`(COALESCE(r.prep_time_minutes, 0) + COALESCE(r.cook_time_minutes, 0)) <= $${values.length}`);
    }
    if (params.maxCalories) {
      values.push(Number(params.maxCalories));
      where.push(`r.calories_per_serving <= $${values.length}`);
    }
    if (tagFilters.length > 0) {
      values.push(tagFilters);
      where.push(`EXISTS (
        SELECT 1
        FROM recipe_tag_assignments rta_filter
        JOIN recipe_tags rt_filter ON rt_filter.id = rta_filter.tag_id
        WHERE rta_filter.recipe_id = r.id AND rt_filter.normalized_name = ANY($${values.length}::text[])
      )`);
    }

    const result = await pool.query(
      `SELECT r.*,
              COALESCE(rup.is_favorite, false) AS is_favorite,
              rup.rating AS my_rating,
              COALESCE(
                json_agg(json_build_object('id', rt.id, 'name', rt.name) ORDER BY rt.name)
                FILTER (WHERE rt.id IS NOT NULL),
                '[]'
              ) AS tags
       FROM recipes r
       LEFT JOIN recipe_user_preferences rup
         ON rup.recipe_id = r.id AND rup.user_id = $2
       LEFT JOIN recipe_tag_assignments rta ON rta.recipe_id = r.id
       LEFT JOIN recipe_tags rt ON rt.id = rta.tag_id
       WHERE ${where.join(' AND ')}
       GROUP BY r.id, rup.is_favorite, rup.rating
       ORDER BY r.created_at DESC`,
      values
    );
    res.json(result.rows);
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Error al obtener las recetas.');
  }
});

router.get('/tags/all', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name FROM recipe_tags WHERE household_id = $1 ORDER BY name',
      [req.user!.householdId]
    );
    res.json(rows);
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Error al obtener las etiquetas.');
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
    recipe.ingredients = await getRecipeIngredients(recipe.id);
    res.json(recipe);
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Error al obtener la receta.');
  }
});

router.put('/:id/preferences', async (req: AuthRequest, res: Response) => {
  const parsed = PreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Preferencias no validas.', parsed.error.flatten());
    return;
  }

  try {
    const recipeExists = await pool.query(
      'SELECT id FROM recipes WHERE id = $1 AND household_id = $2',
      [req.params.id, req.user!.householdId]
    );
    if (!recipeExists.rows.length) {
      sendError(res, 404, 'NOT_FOUND', 'Receta no encontrada.');
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO recipe_user_preferences (recipe_id, user_id, is_favorite, rating, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (recipe_id, user_id)
       DO UPDATE SET
         is_favorite = COALESCE($3, recipe_user_preferences.is_favorite),
         rating = $4,
         updated_at = NOW()
       RETURNING is_favorite, rating AS my_rating`,
      [req.params.id, req.user!.id, parsed.data.isFavorite, parsed.data.rating ?? null]
    );
    res.json(rows[0]);
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Error al guardar preferencias.');
  }
});

router.put('/:id/tags', async (req: AuthRequest, res: Response) => {
  const parsed = TagsSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Etiquetas no validas.', parsed.error.flatten());
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const recipeExists = await client.query(
      'SELECT id FROM recipes WHERE id = $1 AND household_id = $2',
      [req.params.id, req.user!.householdId]
    );
    if (!recipeExists.rows.length) {
      await client.query('ROLLBACK');
      sendError(res, 404, 'NOT_FOUND', 'Receta no encontrada.');
      return;
    }

    await client.query('DELETE FROM recipe_tag_assignments WHERE recipe_id = $1', [req.params.id]);
    for (const rawTag of parsed.data.tags) {
      const normalized = normalizeTagName(rawTag);
      if (!normalized) continue;
      const tag = await client.query(
        `INSERT INTO recipe_tags (household_id, name, normalized_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (household_id, normalized_name)
         DO UPDATE SET name = EXCLUDED.name
         RETURNING id, name`,
        [req.user!.householdId, rawTag.trim(), normalized]
      );
      await client.query(
        `INSERT INTO recipe_tag_assignments (recipe_id, tag_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [req.params.id, tag.rows[0].id]
      );
    }
    await client.query('COMMIT');
    const { rows } = await pool.query(
      `SELECT rt.id, rt.name
       FROM recipe_tags rt
       JOIN recipe_tag_assignments rta ON rta.tag_id = rt.id
       WHERE rta.recipe_id = $1
       ORDER BY rt.name`,
      [req.params.id]
    );
    res.json(rows);
  } catch {
    await client.query('ROLLBACK');
    sendError(res, 500, 'INTERNAL_ERROR', 'Error al guardar etiquetas.');
  } finally {
    client.release();
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
