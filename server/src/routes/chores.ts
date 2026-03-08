import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendPushNotification } from '../services/push.service';

const router = Router();
router.use(authMiddleware);

const TemplateSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    location: z.string().optional(),
    default_assignee_user_id: z.string().uuid().nullable().optional(),
    recurrence_type: z.enum(['daily', 'weekly', 'monthly']).default('weekly'),
    recurrence_days: z.array(z.number().int().min(0).max(6)).default([1]),
    recurrence_interval: z.number().int().min(1).default(1),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    points: z.number().int().min(0).default(1),
});

// Generate chore instances for a template in next N days
async function generateInstances(templateId: string, days = 30) {
    const { rows: [t] } = await pool.query('SELECT * FROM chore_templates WHERE id=$1', [templateId]);
    if (!t || !t.is_active) return;
    
    // Default to today if start_date is somehow missing
    const startDate = new Date(t.start_date || new Date().toISOString().split('T')[0]);
    startDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        d.setHours(0, 0, 0, 0);

        if (d < startDate) continue; // Skip dates before start_date

        const dow = d.getDay();
        const dateStr = d.toISOString().split('T')[0];

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
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const d = parsed.data;
    const { rows } = await pool.query(
        `INSERT INTO chore_templates (household_id, title, description, location, default_assignee_user_id, recurrence_type, recurrence_days, points, recurrence_interval, start_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.user!.householdId, d.title, d.description ?? null, d.location ?? null,
        d.default_assignee_user_id ?? null, d.recurrence_type, d.recurrence_days, d.points, d.recurrence_interval, d.start_date || null]
    );
    const template = rows[0];
    await generateInstances(template.id);
    res.status(201).json(template);

    // Send push notification if a default assignee is set
    if (d.default_assignee_user_id && d.default_assignee_user_id !== req.user!.id) {
        sendPushNotification(d.default_assignee_user_id, {
            title: 'Nueva tarea del hogar',
            body: `${req.user!.name} te ha asignado la tarea interactiva: ${d.title}`,
            url: '/chores'
        });
    }
});

// Update template
router.put('/templates/:id', async (req: AuthRequest, res: Response) => {
    const parsed = TemplateSchema.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const d = parsed.data;
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
    res.json(template);

    // Send push notification if assignment changed
    if (d.default_assignee_user_id && d.default_assignee_user_id !== req.user!.id) {
        sendPushNotification(d.default_assignee_user_id, {
            title: 'Tarea del hogar actualizada',
            body: `${req.user!.name} ha actualizado o te ha asignado: ${template.title}`,
            url: '/chores'
        });
    }
});

// Delete template
router.delete('/templates/:id', async (req: AuthRequest, res: Response) => {
    await pool.query(
        `DELETE FROM chore_templates WHERE id=$1 AND household_id=$2`,
        [req.params.id, req.user!.householdId]
    );
    res.json({ ok: true });
});

// Get instances in a date range
router.get('/instances', async (req: AuthRequest, res: Response) => {
    const { start, end } = req.query;
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
        res.status(404).json({ error: 'Instance not found' });
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
    const { status } = req.body;
    if (!['pending', 'done', 'skipped'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' }); return;
    }
    const completedAt = status === 'done' ? new Date().toISOString() : null;
    const { rows } = await pool.query(
        `UPDATE chore_instances SET status=$1, completed_at=$2 WHERE id=$3 RETURNING *`,
        [status, completedAt, req.params.id]
    );
    res.json(rows[0]);
});

// Get weekly stats
router.get('/stats', async (req: AuthRequest, res: Response) => {
    const { start, end } = req.query;
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
