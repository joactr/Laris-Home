import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const ItemSchema = z.object({
    name: z.string().min(1),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    category: z.string().optional(),
    notes: z.string().optional(),
});

// Get all lists for the household
router.get('/lists', async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(
        'SELECT * FROM shopping_lists WHERE household_id=$1 ORDER BY is_default DESC, name',
        [req.user!.householdId]
    );
    res.json(rows);
});

// Create a list
router.post('/lists', async (req: AuthRequest, res: Response) => {
    const { name, is_default } = req.body;
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    const { rows } = await pool.query(
        'INSERT INTO shopping_lists (household_id, name, is_default) VALUES ($1,$2,$3) RETURNING *',
        [req.user!.householdId, name, is_default ?? false]
    );
    res.status(201).json(rows[0]);
});

// Delete a list
router.delete('/lists/:id', async (req: AuthRequest, res: Response) => {
    await pool.query('DELETE FROM shopping_lists WHERE id=$1 AND household_id=$2', [req.params.id, req.user!.householdId]);
    res.json({ ok: true });
});

// Get items in a list
router.get('/lists/:id/items', async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(
        `SELECT li.*, u.name AS added_by_name, u.color AS added_by_color
     FROM list_items li
     LEFT JOIN users u ON li.added_by_user_id = u.id
     WHERE li.list_id=$1
     ORDER BY li.is_completed, li.created_at DESC`,
        [req.params.id]
    );
    res.json(rows);
});

// Add item to a list
router.post('/lists/:id/items', async (req: AuthRequest, res: Response) => {
    const parsed = ItemSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const { name, quantity, unit, category, notes } = parsed.data;
    const { rows } = await pool.query(
        `INSERT INTO list_items (list_id, name, quantity, unit, category, added_by_user_id, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.params.id, name, quantity ?? null, unit ?? null, category ?? null, req.user!.id, notes ?? null]
    );
    res.status(201).json(rows[0]);
});

// Update an item
router.patch('/items/:id', async (req: AuthRequest, res: Response) => {
    const { name, quantity, unit, category, notes } = req.body;
    const { rows } = await pool.query(
        `UPDATE list_items SET name=COALESCE($1,name), quantity=COALESCE($2,quantity), unit=COALESCE($3,unit),
     category=COALESCE($4,category), notes=COALESCE($5,notes) WHERE id=$6 RETURNING *`,
        [name, quantity, unit, category, notes, req.params.id]
    );
    res.json(rows[0]);
});

// Toggle item complete
router.patch('/items/:id/complete', async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(
        `UPDATE list_items SET is_completed = NOT is_completed,
     completed_at = CASE WHEN is_completed THEN NULL ELSE NOW() END
     WHERE id=$1 RETURNING *`,
        [req.params.id]
    );
    res.json(rows[0]);
});

// Delete an item
router.delete('/items/:id', async (req: AuthRequest, res: Response) => {
    await pool.query('DELETE FROM list_items WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
});

// Re-add completed item (reset completion)
router.post('/items/:id/readd', async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(
        'UPDATE list_items SET is_completed=false, completed_at=null WHERE id=$1 RETURNING *',
        [req.params.id]
    );
    res.json(rows[0]);
});

export default router;
