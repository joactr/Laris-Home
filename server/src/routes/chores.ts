import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const TemplateSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    location: z.string().optional(),
    default_assignee_user_id: z.string().uuid().nullable().optional(),
    recurrence_type: z.enum(['daily', 'weekly', 'monthly']).default('weekly'),
    recurrence_days: z.array(z.number().int().min(0).max(6)).default([1]),
    points: z.number().int().min(0).default(1),
});

// Generate chore instances for a template in next N days
async function generateInstances(templateId: string, days = 30) {
    const { rows: [t] } = await pool.query('SELECT * FROM chore_templates WHERE id=$1', [templateId]);
    if (!t) return;
    for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const dow = d.getDay();
        const dateStr = d.toISOString().split('T')[0];

        let shouldCreate = false;
        if (t.recurrence_type === 'daily') shouldCreate = true;
        else if (t.recurrence_type === 'weekly') shouldCreate = (t.recurrence_days ?? []).includes(dow);
        else if (t.recurrence_type === 'monthly') shouldCreate = (t.recurrence_days ?? []).includes(d.getDate());

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
        `INSERT INTO chore_templates (household_id, title, description, location, default_assignee_user_id, recurrence_type, recurrence_days, points)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.user!.householdId, d.title, d.description ?? null, d.location ?? null,
        d.default_assignee_user_id ?? null, d.recurrence_type, d.recurrence_days, d.points]
    );
    const template = rows[0];
    await generateInstances(template.id);
    res.status(201).json(template);
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
       points=COALESCE($7,points)
     WHERE id=$8 AND household_id=$9 RETURNING *`,
        [d.title, d.description, d.location, d.default_assignee_user_id,
        d.recurrence_type, d.recurrence_days, d.points, req.params.id, req.user!.householdId]
    );
    res.json(rows[0]);
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
