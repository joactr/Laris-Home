import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import {
    ensureHouseholdListAccess,
    findActiveDuplicateCandidates,
    getHouseholdOwnedItem,
    insertShoppingItem,
    mergeShoppingItem,
    normalizeShoppingInput,
    type NormalizedShoppingItem,
} from '../services/shopping.service';

const router = Router();
router.use(authMiddleware);

const GenerateShoppingDecisionSchema = z.object({
    key: z.string().min(1),
    action: z.enum(['add', 'merge', 'skip']),
    duplicateItemId: z.string().uuid().nullable().optional(),
});

const GenerateShoppingSchema = z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    listId: z.string().uuid(),
    decisions: z.array(GenerateShoppingDecisionSchema).optional(),
});

type MealShoppingPreviewItem = NormalizedShoppingItem & {
    key: string;
    sources: Array<{ mealItemId: string; date: string; mealType: string; recipeTitle: string; ingredientName: string }>;
    candidates: any[];
    defaultAction: 'add' | 'merge';
    defaultDuplicateItemId: string | null;
};

// Get meal plan for a week
router.get('/', async (req: AuthRequest, res: Response) => {
    const { start, end } = req.query;
    let query = `
        SELECT m.date,
               json_agg(
                   json_build_object(
                       'id', m.id,
                       'meal_type', m.meal_type,
                       'recipe_id', m.recipe_id,
                       'text_content', m.text_content,
                       'servings', m.servings,
                       'recipe_title', r.title,
                       'recipe_image_url', r.image_url,
                       'prep_time_minutes', r.prep_time_minutes,
                       'cook_time_minutes', r.cook_time_minutes,
                       'calories_per_serving', r.calories_per_serving,
                       'protein_per_serving', r.protein_per_serving,
                       'carbs_per_serving', r.carbs_per_serving,
                       'fat_per_serving', r.fat_per_serving
                   )
               ) as items
        FROM meal_plan_items m
        LEFT JOIN recipes r ON m.recipe_id = r.id
        WHERE m.household_id=$1`;

    const params: any[] = [req.user!.householdId];
    if (start && end) {
        params.push(start, end);
        query += ' AND date >= $2 AND date <= $3';
    }
    query += ' GROUP BY m.date ORDER BY m.date';

    const { rows } = await pool.query(query, params);
    res.json(rows);
});

// Add an item to a meal day
router.post('/:date/items', async (req: AuthRequest, res: Response) => {
    const { meal_type, recipe_id, text_content, servings } = req.body;
    const { rows } = await pool.query(
        `INSERT INTO meal_plan_items (
            household_id, date, meal_type, recipe_id, text_content, servings
        ) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.user!.householdId, req.params.date, meal_type, recipe_id || null, text_content || null, servings || 1]
    );
    res.json(rows[0]);
});

router.put('/items/:id', async (req: AuthRequest, res: Response) => {
    const { servings, text_content } = req.body;
    const { rows } = await pool.query(
        `UPDATE meal_plan_items
         SET servings = COALESCE($1, servings),
             text_content = COALESCE($2, text_content),
             updated_at = NOW()
         WHERE id = $3 AND household_id = $4 RETURNING *`,
        [servings, text_content, req.params.id, req.user!.householdId]
    );
    if (!rows.length) { res.status(404).json({ error: 'Item not found' }); return; }
    res.json(rows[0]);
});

router.delete('/items/:id', async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(
        `DELETE FROM meal_plan_items WHERE id = $1 AND household_id = $2 RETURNING id`,
        [req.params.id, req.user!.householdId]
    );
    if (!rows.length) { res.status(404).json({ error: 'Item not found' }); return; }
    res.json({ success: true, id: req.params.id });
});

router.post('/:date/add-to-shopping', async (req: AuthRequest, res: Response) => {
    const { list_id, ingredients } = req.body;
    if (!list_id || !ingredients) { res.status(400).json({ error: 'list_id and ingredients required' }); return; }
    const lines = (ingredients as string).split('\n').map((l: string) => l.trim()).filter(Boolean);
    const added = [];
    for (const line of lines) {
        added.push(await insertShoppingItem(list_id, req.user!.id, { name: line }));
    }
    res.json(added);
});

router.post('/generate-shopping/preview', async (req: AuthRequest, res: Response) => {
    const parsed = GenerateShoppingSchema.omit({ decisions: true }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    const householdId = req.user!.householdId!;
    const hasAccess = await ensureHouseholdListAccess(parsed.data.listId, householdId);
    if (!hasAccess) { res.status(404).json({ error: 'List not found' }); return; }

    const preview = await buildMealShoppingPreview(parsed.data.start, parsed.data.end, parsed.data.listId, householdId);
    res.json(preview);
});

router.post('/generate-shopping', async (req: AuthRequest, res: Response) => {
    const parsed = GenerateShoppingSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    const { start, end, listId } = parsed.data;
    const householdId = req.user!.householdId!;
    const hasAccess = await ensureHouseholdListAccess(listId, householdId);
    if (!hasAccess) { res.status(404).json({ error: 'List not found' }); return; }

    const preview = await buildMealShoppingPreview(start, end, listId, householdId);
    const decisions = new Map((parsed.data.decisions || []).map((decision) => [decision.key, decision]));
    const addedItems = [];
    const mergedItems = [];
    let skippedCount = 0;

    for (const item of preview.items) {
        const decision = decisions.get(item.key);
        const action = decision?.action || item.defaultAction;
        if (action === 'skip') {
            skippedCount += 1;
            continue;
        }

        if (action === 'merge') {
            const duplicateItemId = decision?.duplicateItemId || item.defaultDuplicateItemId;
            const existingItem = duplicateItemId ? await getHouseholdOwnedItem(duplicateItemId, householdId) : null;
            if (existingItem) {
                mergedItems.push(await mergeShoppingItem(existingItem, req.user!.id, item, 'merge'));
                continue;
            }
        }

        addedItems.push(await insertShoppingItem(listId, req.user!.id, item));
    }

    res.json({
        addedCount: addedItems.length,
        mergedCount: mergedItems.length,
        skippedCount,
        skippedTextMealsCount: preview.skippedTextMealsCount,
        recipeMealCount: preview.recipeMealCount,
        items: [...addedItems, ...mergedItems],
    });
});

async function buildMealShoppingPreview(start: string, end: string, listId: string, householdId: string) {
    const [mealRowsResult, ingredientRowsResult] = await Promise.all([
        pool.query(
            `SELECT id, recipe_id
             FROM meal_plan_items
             WHERE household_id = $1 AND date >= $2 AND date <= $3`,
            [householdId, start, end]
        ),
        pool.query(
            `SELECT
                mpi.id AS meal_item_id,
                mpi.date,
                mpi.meal_type,
                mpi.servings AS meal_servings,
                r.title AS recipe_title,
                r.servings AS recipe_servings,
                ri.name,
                ri.quantity,
                ri.unit,
                ri.notes
             FROM meal_plan_items mpi
             JOIN recipes r ON r.id = mpi.recipe_id
             JOIN recipe_ingredients ri ON ri.recipe_id = r.id
             WHERE mpi.household_id = $1
               AND mpi.date >= $2
               AND mpi.date <= $3
               AND mpi.recipe_id IS NOT NULL
             ORDER BY mpi.date, mpi.meal_type, ri.name`,
            [householdId, start, end]
        ),
    ]);

    const skippedTextMealsCount = mealRowsResult.rows.filter((row) => !row.recipe_id).length;
    const recipeMealCount = mealRowsResult.rows.length - skippedTextMealsCount;
    const groups = new Map<string, MealShoppingPreviewItem>();

    for (const row of ingredientRowsResult.rows) {
        const mealServings = Number(row.meal_servings) || 1;
        const recipeServings = Number(row.recipe_servings);
        const baseQuantity = row.quantity == null ? null : Number(row.quantity);
        let scaledQuantity = baseQuantity;
        if (baseQuantity != null && Number.isFinite(baseQuantity) && Number.isFinite(recipeServings) && recipeServings > 0) {
            scaledQuantity = Number((baseQuantity * mealServings / recipeServings).toFixed(2));
        }

        const normalized = normalizeShoppingInput({
            name: row.name,
            quantity: scaledQuantity,
            unit: row.unit ?? null,
            notes: row.notes ?? null,
        });
        const key = `${normalized.normalized_name}::${normalized.unit || ''}`;
        const current = groups.get(key);
        const source = {
            mealItemId: row.meal_item_id,
            date: String(row.date).slice(0, 10),
            mealType: row.meal_type,
            recipeTitle: row.recipe_title,
            ingredientName: row.name,
        };

        if (!current) {
            groups.set(key, { ...normalized, key, sources: [source], candidates: [], defaultAction: 'add', defaultDuplicateItemId: null });
            continue;
        }

        const canAdd = current.quantity != null && normalized.quantity != null && current.unit === normalized.unit;
        groups.set(key, {
            ...current,
            quantity: canAdd ? Number((Number(current.quantity) + Number(normalized.quantity)).toFixed(2)) : current.quantity,
            notes: [current.notes, normalized.notes].filter(Boolean).join('; ') || null,
            sources: [...current.sources, source],
        });
    }

    const items = [];
    for (const item of groups.values()) {
        const candidates = await findActiveDuplicateCandidates(listId, item.normalized_name);
        const compatible = candidates.find((candidate) => (candidate.unit || null) === (item.unit || null));
        items.push({
            ...item,
            candidates,
            defaultAction: compatible ? 'merge' as const : 'add' as const,
            defaultDuplicateItemId: compatible?.id ?? null,
        });
    }

    return {
        start,
        end,
        listId,
        recipeMealCount,
        skippedTextMealsCount,
        items,
    };
}

export default router;
