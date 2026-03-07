import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const EventSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    start_datetime: z.string(),
    end_datetime: z.string(),
    assigned_user_id: z.string().uuid().nullable().optional(),
    category: z.enum(['personal', 'shared', 'reminder']).default('shared'),
    recurrence: z.string().nullable().optional(),
});

// Get events in a date range
router.get('/', async (req: AuthRequest, res: Response) => {
    const { start, end } = req.query;
    let query = `SELECT e.*, u1.name AS created_by_name, u1.color AS created_by_color,
                u2.name AS assigned_name, u2.color AS assigned_color
               FROM events e
               LEFT JOIN users u1 ON e.created_by_user_id = u1.id
               LEFT JOIN users u2 ON e.assigned_user_id = u2.id
               WHERE e.household_id=$1`;
    const params: any[] = [req.user!.householdId];
    if (start && end) {
        params.push(start, end);
        query += ` AND e.start_datetime >= $2 AND e.start_datetime <= $3`;
    }
    query += ' ORDER BY e.start_datetime';
    const { rows } = await pool.query(query, params);
    res.json(rows);
});

// Create event
router.post('/', async (req: AuthRequest, res: Response) => {
    const parsed = EventSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const d = parsed.data;
    const { rows } = await pool.query(
        `INSERT INTO events (household_id, title, description, start_datetime, end_datetime, created_by_user_id, assigned_user_id, category, recurrence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [req.user!.householdId, d.title, d.description ?? null, d.start_datetime, d.end_datetime,
        req.user!.id, d.assigned_user_id ?? null, d.category, d.recurrence ?? null]
    );
    res.status(201).json(rows[0]);
});

// Update event
router.put('/:id', async (req: AuthRequest, res: Response) => {
    const parsed = EventSchema.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const d = parsed.data;
    const { rows } = await pool.query(
        `UPDATE events SET
       title=COALESCE($1,title), description=COALESCE($2,description),
       start_datetime=COALESCE($3,start_datetime), end_datetime=COALESCE($4,end_datetime),
       assigned_user_id=COALESCE($5,assigned_user_id), category=COALESCE($6,category),
       recurrence=COALESCE($7,recurrence)
     WHERE id=$8 AND household_id=$9 RETURNING *`,
        [d.title, d.description, d.start_datetime, d.end_datetime,
        d.assigned_user_id, d.category, d.recurrence, req.params.id, req.user!.householdId]
    );
    res.json(rows[0]);
});

// Delete event
router.delete('/:id', async (req: AuthRequest, res: Response) => {
    await pool.query('DELETE FROM events WHERE id=$1 AND household_id=$2', [req.params.id, req.user!.householdId]);
    res.json({ ok: true });
});

export default router;
