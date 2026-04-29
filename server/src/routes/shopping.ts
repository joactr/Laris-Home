import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const ItemSchema = z.object({
    name: z.string().min(1),
    quantity: z.coerce.number().positive().optional(),
    unit: z.string().optional(),
    category: z.string().optional(),
    notes: z.string().optional(),
    allowDuplicate: z.boolean().optional(),
});

const MergeSchema = z.object({
    source: ItemSchema,
    mode: z.enum(['merge', 'replace', 'separate']).default('merge'),
});

const UNIT_ALIASES: Record<string, { unit: string; factor: number }> = {
    kg: { unit: 'g', factor: 1000 },
    kilo: { unit: 'g', factor: 1000 },
    kilos: { unit: 'g', factor: 1000 },
    g: { unit: 'g', factor: 1 },
    gr: { unit: 'g', factor: 1 },
    gram: { unit: 'g', factor: 1 },
    grams: { unit: 'g', factor: 1 },
    l: { unit: 'ml', factor: 1000 },
    litro: { unit: 'ml', factor: 1000 },
    litros: { unit: 'ml', factor: 1000 },
    ml: { unit: 'ml', factor: 1 },
    pack: { unit: 'pack', factor: 1 },
    packs: { unit: 'pack', factor: 1 },
    paquete: { unit: 'pack', factor: 1 },
    paquetes: { unit: 'pack', factor: 1 },
    unidad: { unit: 'unit', factor: 1 },
    unidades: { unit: 'unit', factor: 1 },
    ud: { unit: 'unit', factor: 1 },
    uds: { unit: 'unit', factor: 1 },
};

function stripAccents(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeName(value: string) {
    return stripAccents(value)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeUnit(value: string | null | undefined) {
    if (!value) return null;
    const normalized = stripAccents(value).toLowerCase().trim();
    return UNIT_ALIASES[normalized] ?? { unit: normalized, factor: 1 };
}

function normalizeShoppingInput(input: z.infer<typeof ItemSchema>) {
    let name = input.name.trim().replace(/\s+/g, ' ');
    let quantity = input.quantity ?? null;
    let unit = input.unit?.trim() || null;

    const inline = name.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)?\s+(.+)$/);
    if (inline && quantity == null) {
        quantity = Number(inline[1].replace(',', '.'));
        unit = unit || inline[2] || null;
        name = inline[3].trim();
    }

    const unitInfo = normalizeUnit(unit);
    if (quantity != null && unitInfo) {
        quantity = Number((quantity * unitInfo.factor).toFixed(2));
        unit = unitInfo.unit;
    } else if (quantity != null && !unit) {
        unit = 'unit';
    }

    return {
        name,
        normalized_name: normalizeName(name),
        quantity,
        unit,
        category: input.category?.trim() || null,
        notes: input.notes?.trim() || null,
    };
}

async function ensureHouseholdListAccess(listId: string, householdId: string) {
    const { rows } = await pool.query(
        'SELECT id FROM shopping_lists WHERE id = $1 AND household_id = $2',
        [listId, householdId]
    );
    return rows.length > 0;
}

async function getHouseholdOwnedItem(itemId: string, householdId: string) {
    const { rows } = await pool.query(
        `SELECT li.*
         FROM list_items li
         JOIN shopping_lists sl ON sl.id = li.list_id
         WHERE li.id = $1 AND sl.household_id = $2`,
        [itemId, householdId]
    );
    return rows[0] ?? null;
}

async function findActiveDuplicateCandidates(listId: string, normalizedName: string) {
    const { rows } = await pool.query(
        `SELECT *
         FROM list_items
         WHERE list_id = $1
           AND is_completed = false
           AND COALESCE(normalized_name, lower(name)) = $2
         ORDER BY created_at DESC
         LIMIT 5`,
        [listId, normalizedName]
    );
    return rows;
}

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
    const { rowCount } = await pool.query('DELETE FROM shopping_lists WHERE id=$1 AND household_id=$2', [req.params.id, req.user!.householdId]);
    if (rowCount === 0) {
        res.status(404).json({ error: 'List not found' });
        return;
    }
    res.json({ ok: true });
});

// Get items in a list
router.get('/lists/:id/items', async (req: AuthRequest, res: Response) => {
    const hasAccess = await ensureHouseholdListAccess(req.params.id, req.user!.householdId!);
    if (!hasAccess) {
        res.status(404).json({ error: 'List not found' });
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
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const hasAccess = await ensureHouseholdListAccess(req.params.id, req.user!.householdId!);
    if (!hasAccess) {
        res.status(404).json({ error: 'List not found' });
        return;
    }

    const normalized = normalizeShoppingInput(parsed.data);
    const candidates = await findActiveDuplicateCandidates(req.params.id, normalized.normalized_name);
    res.json({ item: normalized, candidates });
});

router.get('/lists/:id/buy-again', async (req: AuthRequest, res: Response) => {
    const hasAccess = await ensureHouseholdListAccess(req.params.id, req.user!.householdId!);
    if (!hasAccess) {
        res.status(404).json({ error: 'List not found' });
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
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const hasAccess = await ensureHouseholdListAccess(req.params.id, req.user!.householdId!);
    if (!hasAccess) {
        res.status(404).json({ error: 'List not found' });
        return;
    }
    const normalized = normalizeShoppingInput(parsed.data);
    if (!parsed.data.allowDuplicate) {
        const candidates = await findActiveDuplicateCandidates(req.params.id, normalized.normalized_name);
        if (candidates.length > 0) {
            res.status(409).json({
                error: {
                    code: 'DUPLICATE_ITEM',
                    message: 'Ya existe un artículo parecido en la lista.',
                    details: { item: normalized, candidates },
                },
            });
            return;
        }
    }

    const { rows } = await pool.query(
        `INSERT INTO list_items (list_id, name, normalized_name, quantity, unit, category, added_by_user_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.params.id, normalized.name, normalized.normalized_name, normalized.quantity, normalized.unit, normalized.category, req.user!.id, normalized.notes]
    );
    res.status(201).json(rows[0]);
});

router.post('/items/:id/merge', async (req: AuthRequest, res: Response) => {
    const parsed = MergeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const existingItem = await getHouseholdOwnedItem(req.params.id, req.user!.householdId!);
    if (!existingItem) {
        res.status(404).json({ error: 'Item not found' });
        return;
    }

    const normalized = normalizeShoppingInput(parsed.data.source);
    if (parsed.data.mode === 'separate') {
        const { rows } = await pool.query(
            `INSERT INTO list_items (list_id, name, normalized_name, quantity, unit, category, added_by_user_id, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [existingItem.list_id, normalized.name, normalized.normalized_name, normalized.quantity, normalized.unit, normalized.category, req.user!.id, normalized.notes]
        );
        res.status(201).json(rows[0]);
        return;
    }

    const canAddQuantities = parsed.data.mode === 'merge'
        && existingItem.unit
        && normalized.unit
        && existingItem.unit === normalized.unit;
    const nextQuantity = canAddQuantities
        ? Number(existingItem.quantity || 0) + Number(normalized.quantity || 0)
        : normalized.quantity ?? existingItem.quantity;

    const { rows } = await pool.query(
        `UPDATE list_items
         SET name = $1,
             normalized_name = $2,
             quantity = $3,
             unit = $4,
             category = COALESCE($5, category),
             notes = COALESCE($6, notes),
             is_completed = false,
             completed_at = null
         WHERE id = $7
         RETURNING *`,
        [
            parsed.data.mode === 'replace' ? normalized.name : existingItem.name,
            normalized.normalized_name,
            nextQuantity,
            normalized.unit ?? existingItem.unit,
            normalized.category,
            normalized.notes,
            req.params.id,
        ]
    );
    res.json(rows[0]);
});

// Update an item
router.patch('/items/:id', async (req: AuthRequest, res: Response) => {
    const existingItem = await getHouseholdOwnedItem(req.params.id, req.user!.householdId!);
    if (!existingItem) {
        res.status(404).json({ error: 'Item not found' });
        return;
    }
    const { name, quantity, unit, category, notes } = req.body;
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
        res.status(404).json({ error: 'Item not found' });
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
        res.status(404).json({ error: 'Item not found' });
        return;
    }
    await pool.query('DELETE FROM list_items WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
});

// Re-add completed item (reset completion)
router.post('/items/:id/readd', async (req: AuthRequest, res: Response) => {
    const existingItem = await getHouseholdOwnedItem(req.params.id, req.user!.householdId!);
    if (!existingItem) {
        res.status(404).json({ error: 'Item not found' });
        return;
    }
    const { rows } = await pool.query(
        'UPDATE list_items SET is_completed=false, completed_at=null WHERE id=$1 RETURNING *',
        [req.params.id]
    );
    res.json(rows[0]);
});

export default router;
