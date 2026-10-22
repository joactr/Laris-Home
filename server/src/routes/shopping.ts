import { Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendError } from '../lib/api-error';
import { requireHousehold } from '../lib/household';
import { createSafeRouter } from '../lib/router';
import {
    ensureHouseholdListAccess,
    findActiveDuplicateCandidates,
    getHouseholdOwnedItem,
    insertShoppingItem,
    mergeShoppingItem,
    normalizeShoppingInput,
} from '../services/shopping.service';

const router = createSafeRouter();
router.use(authMiddleware);
router.use(requireHousehold);

const ItemSchema = z.object({
    name: z.string().trim().min(1).max(200),
    quantity: z.coerce.number().positive().optional(),
    unit: z.string().trim().max(50).optional(),
    category: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(2000).optional(),
    allowDuplicate: z.boolean().optional(),
});

const ItemPatchSchema = ItemSchema.partial().strict();

const ListSchema = z.object({
    name: z.string().trim().min(1).max(100),
    is_default: z.boolean().optional(),
});

const MergeSchema = z.object({
    source: ItemSchema,
    mode: z.enum(['merge', 'replace', 'separate']).default('merge'),
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
    const parsed = ListSchema.safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'List name is not valid.', parsed.error.flatten());
        return;
    }
    const { rows } = await pool.query(
        'INSERT INTO shopping_lists (household_id, name, is_default) VALUES ($1,$2,$3) RETURNING *',
        [req.user!.householdId, parsed.data.name, parsed.data.is_default ?? false]
    );
    res.status(201).json(rows[0]);
});

// Delete a list
router.delete('/lists/:id', async (req: AuthRequest, res: Response) => {
    const { rowCount } = await pool.query('DELETE FROM shopping_lists WHERE id=$1 AND household_id=$2', [req.params.id, req.user!.householdId]);
    if (rowCount === 0) {
        sendError(res, 404, 'NOT_FOUND', 'List not found.');
        return;
    }
    res.json({ ok: true });
});

// Get items in a list
router.get('/lists/:id/items', async (req: AuthRequest, res: Response) => {
    const hasAccess = await ensureHouseholdListAccess(req.params.id, req.user!.householdId!);
    if (!hasAccess) {
        sendError(res, 404, 'NOT_FOUND', 'List not found.');
        return;
    }
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

router.post('/lists/:id/items/preview', async (req: AuthRequest, res: Response) => {
    const parsed = ItemSchema.safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Item data is not valid.', parsed.error.flatten());
        return;
    }
    const hasAccess = await ensureHouseholdListAccess(req.params.id, req.user!.householdId!);
    if (!hasAccess) {
        sendError(res, 404, 'NOT_FOUND', 'List not found.');
        return;
    }

    const normalized = normalizeShoppingInput(parsed.data);
    const candidates = await findActiveDuplicateCandidates(req.params.id, normalized.normalized_name);
    res.json({ item: normalized, candidates });
});

router.get('/lists/:id/buy-again', async (req: AuthRequest, res: Response) => {
    const hasAccess = await ensureHouseholdListAccess(req.params.id, req.user!.householdId!);
    if (!hasAccess) {
        sendError(res, 404, 'NOT_FOUND', 'List not found.');
        return;
    }

    const { rows } = await pool.query(
        `SELECT
            COALESCE(li.normalized_name, lower(li.name)) AS normalized_name,
            (array_agg(li.name ORDER BY li.completed_at DESC NULLS LAST, li.created_at DESC))[1] AS name,
            (array_agg(li.quantity ORDER BY li.completed_at DESC NULLS LAST, li.created_at DESC))[1] AS quantity,
            (array_agg(li.unit ORDER BY li.completed_at DESC NULLS LAST, li.created_at DESC))[1] AS unit,
            (array_agg(li.category ORDER BY li.completed_at DESC NULLS LAST, li.created_at DESC))[1] AS category,
            COUNT(*)::int AS times_bought,
            MAX(li.completed_at) AS last_bought_at
         FROM list_items li
         WHERE li.list_id = $1
           AND li.is_completed = true
           AND NOT EXISTS (
             SELECT 1 FROM list_items active
             WHERE active.list_id = li.list_id
               AND active.is_completed = false
               AND COALESCE(active.normalized_name, lower(active.name)) = COALESCE(li.normalized_name, lower(li.name))
           )
         GROUP BY COALESCE(li.normalized_name, lower(li.name))
         ORDER BY MAX(li.completed_at) DESC NULLS LAST, COUNT(*) DESC
         LIMIT 8`,
        [req.params.id]
    );
    res.json(rows);
});

// Add item to a list
router.post('/lists/:id/items', async (req: AuthRequest, res: Response) => {
    const parsed = ItemSchema.safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Item data is not valid.', parsed.error.flatten());
        return;
    }
    const hasAccess = await ensureHouseholdListAccess(req.params.id, req.user!.householdId!);
    if (!hasAccess) {
        sendError(res, 404, 'NOT_FOUND', 'List not found.');
        return;
    }
    const normalized = normalizeShoppingInput(parsed.data);
    if (!parsed.data.allowDuplicate) {
        const candidates = await findActiveDuplicateCandidates(req.params.id, normalized.normalized_name);
        if (candidates.length > 0) {
            sendError(res, 409, 'DUPLICATE_ITEM', 'A similar item already exists in the list.', {
                item: normalized,
                candidates,
            });
            return;
        }
    }

    const item = await insertShoppingItem(req.params.id, req.user!.id, parsed.data);
    res.status(201).json(item);
});

router.post('/items/:id/merge', async (req: AuthRequest, res: Response) => {
    const parsed = MergeSchema.safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Item data is not valid.', parsed.error.flatten());
        return;
    }
    const existingItem = await getHouseholdOwnedItem(req.params.id, req.user!.householdId!);
    if (!existingItem) {
        sendError(res, 404, 'NOT_FOUND', 'Item not found.');
        return;
    }

    const result = await mergeShoppingItem(existingItem, req.user!.id, parsed.data.source, parsed.data.mode);
    res.status(parsed.data.mode === 'separate' ? 201 : 200).json(result);
});

// Update an item
router.patch('/items/:id', async (req: AuthRequest, res: Response) => {
    const existingItem = await getHouseholdOwnedItem(req.params.id, req.user!.householdId!);
    if (!existingItem) {
        sendError(res, 404, 'NOT_FOUND', 'Item not found.');
        return;
    }
    const parsed = ItemPatchSchema.safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Item data is not valid.', parsed.error.flatten());
        return;
    }
    const { name, quantity, unit, category, notes } = parsed.data;
    const normalized = name ? normalizeShoppingInput({ name, quantity, unit, category, notes }) : null;
    const { rows } = await pool.query(
        `UPDATE list_items SET name=COALESCE($1,name), normalized_name=COALESCE($2,normalized_name),
     quantity=COALESCE($3,quantity), unit=COALESCE($4,unit),
     category=COALESCE($5,category), notes=COALESCE($6,notes) WHERE id=$7 RETURNING *`,
        [normalized?.name ?? null, normalized?.normalized_name ?? null, normalized?.quantity ?? quantity, normalized?.unit ?? unit, normalized?.category ?? category, normalized?.notes ?? notes, req.params.id]
    );
    res.json(rows[0]);
});

// Toggle item complete
router.patch('/items/:id/complete', async (req: AuthRequest, res: Response) => {
    const existingItem = await getHouseholdOwnedItem(req.params.id, req.user!.householdId!);
    if (!existingItem) {
        sendError(res, 404, 'NOT_FOUND', 'Item not found.');
        return;
    }
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
    const existingItem = await getHouseholdOwnedItem(req.params.id, req.user!.householdId!);
    if (!existingItem) {
        sendError(res, 404, 'NOT_FOUND', 'Item not found.');
        return;
    }
    await pool.query('DELETE FROM list_items WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
});

// Re-add completed item (reset completion)
router.post('/items/:id/readd', async (req: AuthRequest, res: Response) => {
    const existingItem = await getHouseholdOwnedItem(req.params.id, req.user!.householdId!);
    if (!existingItem) {
        sendError(res, 404, 'NOT_FOUND', 'Item not found.');
        return;
    }
    const { rows } = await pool.query(
        'UPDATE list_items SET is_completed=false, completed_at=null WHERE id=$1 RETURNING *',
        [req.params.id]
    );
    res.json(rows[0]);
});

export default router;
