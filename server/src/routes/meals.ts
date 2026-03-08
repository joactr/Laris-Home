import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const MealDaySchema = z.object({
    date: z.string(),
    breakfast: z.string().nullable().optional(),
    lunch: z.string().nullable().optional(),
    dinner: z.string().nullable().optional(),
    snack: z.string().nullable().optional(),
    breakfast_recipe_id: z.string().uuid().nullable().optional(),
    lunch_recipe_id: z.string().uuid().nullable().optional(),
    dinner_recipe_id: z.string().uuid().nullable().optional(),
    snack_recipe_id: z.string().uuid().nullable().optional(),
    notes: z.string().nullable().optional(),
});

// Get meal plan for a week
router.get('/', async (req: AuthRequest, res: Response) => {
    const { start, end } = req.query;
    // We group items by day and return an array of day objects
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

// Update a meal item
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

// Delete a meal item
router.delete('/items/:id', async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(
        `DELETE FROM meal_plan_items WHERE id = $1 AND household_id = $2 RETURNING id`,
        [req.params.id, req.user!.householdId]
    );
    if (!rows.length) { res.status(404).json({ error: 'Item not found' }); return; }
    res.json({ success: true, id: req.params.id });
});

// Add meal ingredients to shopping list
router.post('/:date/add-to-shopping', async (req: AuthRequest, res: Response) => {
    const { list_id, ingredients } = req.body;
    if (!list_id || !ingredients) { res.status(400).json({ error: 'list_id and ingredients required' }); return; }
    const lines = (ingredients as string).split('\n').map((l: string) => l.trim()).filter(Boolean);
    const added = [];
    for (const line of lines) {
        const { rows } = await pool.query(
            `INSERT INTO list_items (list_id, name, added_by_user_id) VALUES ($1,$2,$3) RETURNING *`,
            [list_id, line, req.user!.id]
        );
        added.push(rows[0]);
    }
    res.json(added);
});

export default router;
