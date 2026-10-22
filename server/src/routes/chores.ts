import { Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendError } from '../lib/api-error';
import { addDays, parseDateString, startOfDay, startOfWeek, toDateString } from '../lib/dates';
import { isHouseholdMember, requireHousehold } from '../lib/household';
import { createSafeRouter } from '../lib/router';
import { sendPushNotification } from '../services/push.service';

const router = createSafeRouter();
router.use(authMiddleware);
router.use(requireHousehold);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_GENERATED_DAYS = 120;

const TemplateSchema = z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    location: z.string().trim().max(200).optional(),
    default_assignee_user_id: z.string().uuid().nullable().optional(),
    recurrence_type: z.enum(['daily', 'weekly', 'monthly']).default('weekly'),
    recurrence_days: z.array(z.number().int().min(0).max(6)).default([1]),
    recurrence_interval: z.number().int().min(1).default(1),
    start_date: z.string().regex(DATE_PATTERN).optional(),
    points: z.number().int().min(0).default(1),
});

router.param('id', (req, res, next, id) => {
    if (z.string().uuid().safeParse(id).success) {
        next();
        return;
    }
    sendError(res, 404, 'NOT_FOUND', 'Chore not found.');
});

// Generate chore instances for a template in next N days
async function generateInstances(templateId: string, days = 30, householdId?: string) {
    const { rows: [t] } = await pool.query(
        `SELECT * FROM chore_templates WHERE id = $1${householdId ? ' AND household_id = $2' : ''}`,
        householdId ? [templateId, householdId] : [templateId]
    );
    if (!t || !t.is_active) return;

    const today = startOfDay(new Date());
    const startDate = startOfDay(t.start_date ? parseDateString(String(t.start_date)) : today);
    const limit = Math.min(days, MAX_GENERATED_DAYS);

    for (let i = 0; i < limit; i++) {
        const d = addDays(today, i);
        if (d < startDate) continue;

        const dow = d.getDay();
        const dateStr = toDateString(d);

        let shouldCreate = false;
        
        if (t.recurrence_type === 'daily') {
            const daysDiff = Math.round((d.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            shouldCreate = daysDiff % (t.recurrence_interval || 1) === 0;
        } else if (t.recurrence_type === 'weekly') {
            const startWeekDate = new Date(startDate);
            startWeekDate.setDate(startWeekDate.getDate() - startWeekDate.getDay());
            
            const currentWeekDate = new Date(d);
            currentWeekDate.setDate(currentWeekDate.getDate() - currentWeekDate.getDay());
            
            const weeksDiff = Math.round((currentWeekDate.getTime() - startWeekDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
            
            if (weeksDiff % (t.recurrence_interval || 1) === 0) {
                shouldCreate = (t.recurrence_days ?? []).includes(dow);
            }
        } else if (t.recurrence_type === 'monthly') {
            const monthDiff = (d.getFullYear() - startDate.getFullYear()) * 12 + (d.getMonth() - startDate.getMonth());
            if (monthDiff % (t.recurrence_interval || 1) === 0) {
                shouldCreate = (t.recurrence_days ?? []).includes(d.getDate());
            }
        }

        if (shouldCreate) {
            await pool.query(
                `INSERT INTO chore_instances (template_id, scheduled_date, assigned_user_id)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
                [templateId, dateStr, t.default_assignee_user_id]
            );
        }
    }
}

// Instances are generated lazily so a template that was created weeks ago
// still has entries for the range the calendar is asking for.
async function ensureInstancesForRange(householdId: string, end: string) {
    const days = Math.ceil((parseDateString(end).getTime() - startOfDay(new Date()).getTime()) / 86_400_000) + 1;
    if (days <= 0) return;

    const { rows } = await pool.query(
        'SELECT id FROM chore_templates WHERE household_id = $1 AND is_active = TRUE',
        [householdId]
    );
    for (const template of rows) {
        await generateInstances(template.id, days, householdId);
    }
}

// Get all templates
router.get('/templates', async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(
        `SELECT ct.*, u.name AS assignee_name, u.color AS assignee_color
     FROM chore_templates ct LEFT JOIN users u ON ct.default_assignee_user_id = u.id
     WHERE ct.household_id=$1 ORDER BY ct.title`,
        [req.user!.householdId]
    );
    res.json(rows);
});

// Create template
router.post('/templates', async (req: AuthRequest, res: Response) => {
    const parsed = TemplateSchema.safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Chore data is not valid.', parsed.error.flatten());
        return;
    }
    const d = parsed.data;
    if (d.default_assignee_user_id) {
        const isMember = await isHouseholdMember(d.default_assignee_user_id, req.user!.householdId!);
        if (!isMember) {
            sendError(res, 400, 'VALIDATION_ERROR', 'Assigned user does not belong to the household.');
            return;
        }
    }
    const { rows } = await pool.query(
        `INSERT INTO chore_templates (household_id, title, description, location, default_assignee_user_id, recurrence_type, recurrence_days, points, recurrence_interval, start_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.user!.householdId, d.title, d.description ?? null, d.location ?? null,
        d.default_assignee_user_id ?? null, d.recurrence_type, d.recurrence_days, d.points, d.recurrence_interval, d.start_date || null]
    );
    const template = rows[0];
    await generateInstances(template.id, 30, req.user!.householdId!);
    res.status(201).json(template);

    if (d.default_assignee_user_id && d.default_assignee_user_id !== req.user!.id) {
        void sendPushNotification(d.default_assignee_user_id, {
            title: 'New household chore',
            body: `${req.user!.name} assigned you the chore: ${d.title}`,
            url: '/chores'
        }).catch((error) => console.error('Chore push failed:', error));
    }
});

// Update template
router.put('/templates/:id', async (req: AuthRequest, res: Response) => {
    const parsed = TemplateSchema.partial().safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Chore data is not valid.', parsed.error.flatten());
        return;
    }
    const d = parsed.data;
    if (d.default_assignee_user_id) {
        const isMember = await isHouseholdMember(d.default_assignee_user_id, req.user!.householdId!);
        if (!isMember) {
            sendError(res, 400, 'VALIDATION_ERROR', 'Assigned user does not belong to the household.');
            return;
        }
    }
    const { rows } = await pool.query(
        `UPDATE chore_templates SET
       title=COALESCE($1,title), description=COALESCE($2,description), location=COALESCE($3,location),
       default_assignee_user_id=COALESCE($4,default_assignee_user_id),
       recurrence_type=COALESCE($5,recurrence_type), recurrence_days=COALESCE($6,recurrence_days),
       points=COALESCE($7,points),
       recurrence_interval=COALESCE($8,recurrence_interval),
       start_date=COALESCE($9,start_date)
     WHERE id=$10 AND household_id=$11 RETURNING *`,
        [d.title, d.description, d.location, d.default_assignee_user_id,
        d.recurrence_type, d.recurrence_days, d.points, d.recurrence_interval, d.start_date, req.params.id, req.user!.householdId]
    );
    const template = rows[0];
    if (!template) {
        sendError(res, 404, 'NOT_FOUND', 'Chore not found.');
        return;
    }
    await generateInstances(template.id, 30, req.user!.householdId!);
    res.json(template);

    if (d.default_assignee_user_id && d.default_assignee_user_id !== req.user!.id) {
        void sendPushNotification(d.default_assignee_user_id, {
            title: 'Household chore updated',
            body: `${req.user!.name} updated or assigned you: ${template.title}`,
            url: '/chores'
        }).catch((error) => console.error('Chore push failed:', error));
    }
});

// Delete template
router.delete('/templates/:id', async (req: AuthRequest, res: Response) => {
    const { rowCount } = await pool.query(
        `DELETE FROM chore_templates WHERE id=$1 AND household_id=$2`,
        [req.params.id, req.user!.householdId]
    );
    if (rowCount === 0) {
        sendError(res, 404, 'NOT_FOUND', 'Chore not found.');
        return;
    }
    res.json({ ok: true });
});

// Get instances in a date range
router.get('/instances', async (req: AuthRequest, res: Response) => {
    const start = typeof req.query.start === 'string' ? req.query.start : undefined;
    const end = typeof req.query.end === 'string' ? req.query.end : undefined;
    if ((start || end) && !(start && end && DATE_PATTERN.test(start) && DATE_PATTERN.test(end))) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Date range is not valid.');
        return;
    }

    if (end) {
        await ensureInstancesForRange(req.user!.householdId!, end);
    }

    let query = `SELECT ci.*, ct.title, ct.location, ct.points,
                u.name AS assigned_name, u.color AS assigned_color
               FROM chore_instances ci
               JOIN chore_templates ct ON ci.template_id = ct.id
               LEFT JOIN users u ON ci.assigned_user_id = u.id
               WHERE ct.household_id=$1`;
    const params: any[] = [req.user!.householdId];
    if (start && end) {
        params.push(start, end);
        query += ` AND ci.scheduled_date >= $2 AND ci.scheduled_date <= $3`;
    }
    query += ' ORDER BY ci.scheduled_date, ct.title';
    const { rows } = await pool.query(query, params);
    res.json(rows);
});

// Delete instance and future recurrences
router.delete('/instances/:id', async (req: AuthRequest, res: Response) => {
    // 1. Get the instance to find its template and date
    const { rows: [instance] } = await pool.query(
        `SELECT ci.*, ct.household_id 
         FROM chore_instances ci 
         JOIN chore_templates ct ON ci.template_id = ct.id 
         WHERE ci.id = $1`,
        [req.params.id]
    );

    if (!instance || instance.household_id !== req.user!.householdId) {
        sendError(res, 404, 'NOT_FOUND', 'Chore instance not found.');
        return;
    }

    // 2. Mark template as inactive so it won't generate more
    await pool.query(
        `UPDATE chore_templates SET is_active = FALSE WHERE id = $1`,
        [instance.template_id]
    );

    // 3. Delete this instance and all future ones
    await pool.query(
        `DELETE FROM chore_instances 
         WHERE template_id = $1 AND scheduled_date >= $2`,
        [instance.template_id, instance.scheduled_date]
    );

    res.json({ ok: true });
});

// Update instance status
router.patch('/instances/:id/status', async (req: AuthRequest, res: Response) => {
    const parsed = z.object({ status: z.enum(['pending', 'done', 'skipped']) }).safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Chore status is not valid.');
        return;
    }
    const { status } = parsed.data;
    const { rows } = await pool.query(
        `UPDATE chore_instances ci
         SET status=$1, completed_at = CASE WHEN $1 = 'done' THEN NOW() ELSE NULL END
         FROM chore_templates ct
         WHERE ci.id=$2 AND ci.template_id = ct.id AND ct.household_id = $3
         RETURNING ci.*`,
        [status, req.params.id, req.user!.householdId]
    );
    if (rows.length === 0) {
        sendError(res, 404, 'NOT_FOUND', 'Chore instance not found.');
        return;
    }
    res.json(rows[0]);
});

// Get weekly stats
router.get('/stats', async (req: AuthRequest, res: Response) => {
    const rawStart = typeof req.query.start === 'string' ? req.query.start : undefined;
    const rawEnd = typeof req.query.end === 'string' ? req.query.end : undefined;
    if ((rawStart || rawEnd) && !(rawStart && rawEnd && DATE_PATTERN.test(rawStart) && DATE_PATTERN.test(rawEnd))) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Date range is not valid.');
        return;
    }
    const weekStart = startOfWeek(new Date());
    const start = rawStart ?? toDateString(weekStart);
    const end = rawEnd ?? toDateString(addDays(weekStart, 6));
    const { rows } = await pool.query(
        `SELECT u.id, u.name, u.color,
       COUNT(*) FILTER (WHERE ci.status='done') AS completed,
       SUM(ct.points) FILTER (WHERE ci.status='done') AS points
     FROM chore_instances ci
     JOIN chore_templates ct ON ci.template_id = ct.id
     JOIN users u ON ci.assigned_user_id = u.id
     WHERE ct.household_id=$1 AND ci.scheduled_date >= $2 AND ci.scheduled_date <= $3
     GROUP BY u.id, u.name, u.color`,
        [req.user!.householdId, start, end]
    );
    res.json(rows);
});

export default router;
