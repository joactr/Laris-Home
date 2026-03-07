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
    let query = `
        SELECT m.*, 
            rb.title as breakfast_recipe_title, rb.calories_per_serving as breakfast_calories, rb.protein_per_serving as breakfast_protein, rb.carbs_per_serving as breakfast_carbs, rb.fat_per_serving as breakfast_fat,
            rl.title as lunch_recipe_title, rl.calories_per_serving as lunch_calories, rl.protein_per_serving as lunch_protein, rl.carbs_per_serving as lunch_carbs, rl.fat_per_serving as lunch_fat,
            rd.title as dinner_recipe_title, rd.calories_per_serving as dinner_calories, rd.protein_per_serving as dinner_protein, rd.carbs_per_serving as dinner_carbs, rd.fat_per_serving as dinner_fat,
            rs.title as snack_recipe_title, rs.calories_per_serving as snack_calories, rs.protein_per_serving as snack_protein, rs.carbs_per_serving as snack_carbs, rs.fat_per_serving as snack_fat
        FROM meal_plan_days m
        LEFT JOIN recipes rb ON m.breakfast_recipe_id = rb.id
        LEFT JOIN recipes rl ON m.lunch_recipe_id = rl.id
        LEFT JOIN recipes rd ON m.dinner_recipe_id = rd.id
        LEFT JOIN recipes rs ON m.snack_recipe_id = rs.id
        WHERE m.household_id=$1`;
    const params: any[] = [req.user!.householdId];
    if (start && end) { params.push(start, end); query += ' AND date >= $2 AND date <= $3'; }
    query += ' ORDER BY date';
    const { rows } = await pool.query(query, params);
    res.json(rows);
});

// Upsert meal plan day
router.put('/:date', async (req: AuthRequest, res: Response) => {
    const parsed = MealDaySchema.safeParse({ date: req.params.date, ...req.body });
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const d = parsed.data;
    const { rows } = await pool.query(
        `INSERT INTO meal_plan_days (
            household_id, date, breakfast, lunch, dinner, snack,
            breakfast_recipe_id, lunch_recipe_id, dinner_recipe_id, snack_recipe_id, notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (household_id, date) DO UPDATE
        SET breakfast=$3, lunch=$4, dinner=$5, snack=$6,
            breakfast_recipe_id=$7, lunch_recipe_id=$8, dinner_recipe_id=$9, snack_recipe_id=$10,
            notes=$11 RETURNING *`,
        [
            req.user!.householdId, d.date, 
            d.breakfast ?? null, d.lunch ?? null, d.dinner ?? null, d.snack ?? null,
            d.breakfast_recipe_id ?? null, d.lunch_recipe_id ?? null, d.dinner_recipe_id ?? null, d.snack_recipe_id ?? null,
            d.notes ?? null
        ]
    );
    res.json(rows[0]);
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
