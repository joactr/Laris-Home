import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendPushNotification } from '../services/push.service';

const router = Router();
router.use(authMiddleware);

const ProjectSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    status: z.enum(['active', 'archived']).default('active'),
});

const TaskSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    status: z.enum(['todo', 'inProgress', 'done']).default('todo'),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    assigned_user_id: z.string().uuid().nullable().optional(),
    due_date: z.string().nullable().optional(),
});

// Projects CRUD
router.get('/', async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(
        'SELECT * FROM projects WHERE household_id=$1 ORDER BY status, name',
        [req.user!.householdId]
    );
    res.json(rows);
});

router.post('/', async (req: AuthRequest, res: Response) => {
    const parsed = ProjectSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const { rows } = await pool.query(
        'INSERT INTO projects (household_id, name, description, status) VALUES ($1,$2,$3,$4) RETURNING *',
        [req.user!.householdId, parsed.data.name, parsed.data.description ?? null, parsed.data.status]
    );
    res.status(201).json(rows[0]);
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
    const parsed = ProjectSchema.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const { rows } = await pool.query(
        `UPDATE projects SET name=COALESCE($1,name), description=COALESCE($2,description), status=COALESCE($3,status)
     WHERE id=$4 AND household_id=$5 RETURNING *`,
        [parsed.data.name, parsed.data.description, parsed.data.status, req.params.id, req.user!.householdId]
    );
    res.json(rows[0]);
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
    await pool.query('DELETE FROM projects WHERE id=$1 AND household_id=$2', [req.params.id, req.user!.householdId]);
    res.json({ ok: true });
});

// Tasks
router.get('/:projectId/tasks', async (req: AuthRequest, res: Response) => {
    const { status, assignee } = req.query;
    let query = `SELECT t.*, u.name AS assigned_name, u.color AS assigned_color
               FROM tasks t LEFT JOIN users u ON t.assigned_user_id = u.id
               WHERE t.project_id=$1`;
    const params: any[] = [req.params.projectId];
    if (status) { params.push(status); query += ` AND t.status=$${params.length}`; }
    if (assignee) { params.push(assignee); query += ` AND t.assigned_user_id=$${params.length}`; }
    query += ' ORDER BY t.status, t.priority DESC, t.created_at';
    const { rows } = await pool.query(query, params);
    res.json(rows);
});

router.post('/:projectId/tasks', async (req: AuthRequest, res: Response) => {
    const parsed = TaskSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const d = parsed.data;
    const { rows } = await pool.query(
        `INSERT INTO tasks (project_id, title, description, status, priority, created_by_user_id, assigned_user_id, due_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.params.projectId, d.title, d.description ?? null, d.status, d.priority,
        req.user!.id, d.assigned_user_id ?? null, d.due_date ?? null]
    );
    res.status(201).json(rows[0]);

    // Send push notification if assigned to someone else
    if (d.assigned_user_id && d.assigned_user_id !== req.user!.id) {
        sendPushNotification(d.assigned_user_id, {
            title: 'Nueva tarea asignada',
            body: `${req.user!.name} te ha asignado: ${d.title}`,
            url: `/projects/${req.params.projectId}`
        });
    }
});

router.patch('/tasks/:id', async (req: AuthRequest, res: Response) => {
    const parsed = TaskSchema.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const d = parsed.data;
    const { rows } = await pool.query(
        `UPDATE tasks SET title=COALESCE($1,title), description=COALESCE($2,description),
       status=COALESCE($3,status), priority=COALESCE($4,priority),
       assigned_user_id=COALESCE($5,assigned_user_id), due_date=COALESCE($6,due_date),
       updated_at=NOW()
     WHERE id=$7 RETURNING *`,
        [d.title, d.description, d.status, d.priority, d.assigned_user_id, d.due_date, req.params.id]
    );
    const task = rows[0];
    res.json(task);

    // Send push notification if assignment changed or updated and it's not the current user
    if (d.assigned_user_id && d.assigned_user_id !== req.user!.id) {
        sendPushNotification(d.assigned_user_id, {
            title: 'Tarea actualizada/asignada',
            body: `${req.user!.name} te ha asignado o actualizado: ${task.title}`,
            url: `/projects` // Could be more specific if we had project_id here
        });
    }
});

router.delete('/tasks/:id', async (req: AuthRequest, res: Response) => {
    await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
});

export default router;
