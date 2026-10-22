import { Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendError } from '../lib/api-error';
import { isHouseholdMember, requireHousehold } from '../lib/household';
import { createSafeRouter } from '../lib/router';
import { sendPushNotification } from '../services/push.service';

const router = createSafeRouter();
router.use(authMiddleware);
router.use(requireHousehold);

const EventSchema = z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    start_datetime: z.string().datetime(),
    end_datetime: z.string().datetime(),
    assigned_user_id: z.string().uuid().nullable().optional(),
    category: z.enum(['personal', 'shared', 'reminder']).default('shared'),
    recurrence: z.string().max(20).nullable().optional(),
}).refine((data) => new Date(data.end_datetime) >= new Date(data.start_datetime), {
    message: 'End date must be after the start.',
});

const EventPatchSchema = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    start_datetime: z.string().datetime().optional(),
    end_datetime: z.string().datetime().optional(),
    assigned_user_id: z.string().uuid().nullable().optional(),
    category: z.enum(['personal', 'shared', 'reminder']).optional(),
    recurrence: z.string().max(20).nullable().optional(),
});

router.param('id', (req, res, next, id) => {
    if (z.string().uuid().safeParse(id).success) {
        next();
        return;
    }
    sendError(res, 404, 'NOT_FOUND', 'Event not found.');
});

// Get events in a date range
router.get('/', async (req: AuthRequest, res: Response) => {
    const start = typeof req.query.start === 'string' ? req.query.start : undefined;
    const end = typeof req.query.end === 'string' ? req.query.end : undefined;
    if ((start || end) && !(start && end && !Number.isNaN(Date.parse(start)) && !Number.isNaN(Date.parse(end)))) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Date range is not valid.');
        return;
    }
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
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Event data is not valid.', parsed.error.flatten());
        return;
    }
    const d = parsed.data;

    if (d.assigned_user_id && !(await isHouseholdMember(d.assigned_user_id, req.user!.householdId!))) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Assigned user does not belong to the household.');
        return;
    }

    const { rows } = await pool.query(
        `INSERT INTO events (household_id, title, description, start_datetime, end_datetime, created_by_user_id, assigned_user_id, category, recurrence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [req.user!.householdId, d.title, d.description ?? null, d.start_datetime, d.end_datetime,
        req.user!.id, d.assigned_user_id ?? null, d.category, d.recurrence ?? null]
    );
    res.status(201).json(rows[0]);

    if (d.assigned_user_id && d.assigned_user_id !== req.user!.id) {
        void sendPushNotification(d.assigned_user_id, {
            title: 'New calendar event',
            body: `${req.user!.name} assigned you: ${d.title}`,
            url: '/calendar'
        }).catch((error) => console.error('Calendar push failed:', error));
    }
});

// Update event
router.put('/:id', async (req: AuthRequest, res: Response) => {
    const parsed = EventPatchSchema.safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Event data is not valid.', parsed.error.flatten());
        return;
    }
    const d = parsed.data;
    const hasAssignee = Object.prototype.hasOwnProperty.call(req.body, 'assigned_user_id');
    const hasRecurrence = Object.prototype.hasOwnProperty.call(req.body, 'recurrence');

    if (d.assigned_user_id && !(await isHouseholdMember(d.assigned_user_id, req.user!.householdId!))) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Assigned user does not belong to the household.');
        return;
    }

    const { rows } = await pool.query(
        `UPDATE events SET
       title=COALESCE($1,title), description=COALESCE($2,description),
       start_datetime=COALESCE($3,start_datetime), end_datetime=COALESCE($4,end_datetime),
       assigned_user_id=CASE WHEN $5::boolean THEN $6::uuid ELSE assigned_user_id END,
       category=COALESCE($7,category),
       recurrence=CASE WHEN $8::boolean THEN $9 ELSE recurrence END
     WHERE id=$10 AND household_id=$11 RETURNING *`,
        [d.title ?? null, d.description ?? null, d.start_datetime ?? null, d.end_datetime ?? null,
        hasAssignee, d.assigned_user_id ?? null, d.category ?? null,
        hasRecurrence, d.recurrence ?? null, req.params.id, req.user!.householdId]
    );
    if (rows.length === 0) {
        sendError(res, 404, 'NOT_FOUND', 'Event not found.');
        return;
    }
    const event = rows[0];
    res.json(event);

    if (d.assigned_user_id && d.assigned_user_id !== req.user!.id) {
        void sendPushNotification(d.assigned_user_id, {
            title: 'Calendar event updated',
            body: `${req.user!.name} updated or assigned you: ${event.title}`,
            url: '/calendar'
        }).catch((error) => console.error('Calendar push failed:', error));
    }
});

// Delete event
router.delete('/:id', async (req: AuthRequest, res: Response) => {
    const { rowCount } = await pool.query('DELETE FROM events WHERE id=$1 AND household_id=$2', [
        req.params.id,
        req.user!.householdId,
    ]);
    if (rowCount === 0) {
        sendError(res, 404, 'NOT_FOUND', 'Event not found.');
        return;
    }
    res.json({ ok: true });
});

export default router;
