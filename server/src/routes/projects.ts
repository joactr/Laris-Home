import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendError } from '../lib/api-error';
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

async function findProjectForHousehold(projectId: string, householdId: string) {
    const { rows } = await pool.query(
        'SELECT * FROM projects WHERE id = $1 AND household_id = $2',
        [projectId, householdId]
    );
    return rows[0] || null;
}

async function findTaskForHousehold(taskId: string, householdId: string) {
    const { rows } = await pool.query(
        `SELECT t.*
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE t.id = $1 AND p.household_id = $2`,
        [taskId, householdId]
    );
    return rows[0] || null;
}

async function ensureAssignableUser(userId: string | null | undefined, householdId: string) {
    if (!userId) {
        return true;
    }

    const { rows } = await pool.query(
        `SELECT 1
         FROM memberships
         WHERE user_id = $1 AND household_id = $2`,
        [userId, householdId]
    );
    return rows.length > 0;
}

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
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Los datos del proyecto no son validos.', parsed.error.flatten());
        return;
    }

    const { rows } = await pool.query(
        'INSERT INTO projects (household_id, name, description, status) VALUES ($1,$2,$3,$4) RETURNING *',
        [req.user!.householdId, parsed.data.name, parsed.data.description ?? null, parsed.data.status]
    );
    res.status(201).json(rows[0]);
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
    const parsed = ProjectSchema.partial().safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Los datos del proyecto no son validos.', parsed.error.flatten());
        return;
    }

    const { rows } = await pool.query(
        `UPDATE projects
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             status = COALESCE($3, status)
         WHERE id = $4 AND household_id = $5
         RETURNING *`,
        [parsed.data.name, parsed.data.description, parsed.data.status, req.params.id, req.user!.householdId]
    );

    if (!rows.length) {
        sendError(res, 404, 'NOT_FOUND', 'Proyecto no encontrado.');
        return;
    }

    res.json(rows[0]);
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
    const result = await pool.query(
        'DELETE FROM projects WHERE id=$1 AND household_id=$2',
        [req.params.id, req.user!.householdId]
    );

    if (result.rowCount === 0) {
        sendError(res, 404, 'NOT_FOUND', 'Proyecto no encontrado.');
        return;
    }

    res.json({ ok: true });
});

// Tasks
router.get('/:projectId/tasks', async (req: AuthRequest, res: Response) => {
    const { status, assignee } = req.query;
    let query = `SELECT t.*, u.name AS assigned_name, u.color AS assigned_color
                 FROM tasks t
                 JOIN projects p ON p.id = t.project_id
                 LEFT JOIN users u ON t.assigned_user_id = u.id
                 WHERE t.project_id = $1 AND p.household_id = $2`;
    const params: unknown[] = [req.params.projectId, req.user!.householdId];

    if (status) {
        params.push(String(status));
        query += ` AND t.status = $${params.length}`;
    }

    if (assignee) {
        params.push(String(assignee));
        query += ` AND t.assigned_user_id = $${params.length}`;
    }

    query += ' ORDER BY t.status, t.priority DESC, t.created_at';
    const { rows } = await pool.query(query, params);
    res.json(rows);
});

router.post('/:projectId/tasks', async (req: AuthRequest, res: Response) => {
    const parsed = TaskSchema.safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Los datos de la tarea no son validos.', parsed.error.flatten());
        return;
    }

    const householdId = req.user!.householdId || '';
    const project = await findProjectForHousehold(req.params.projectId, householdId);
    if (!project) {
        sendError(res, 404, 'NOT_FOUND', 'Proyecto no encontrado.');
        return;
    }

    const d = parsed.data;
    const canAssignUser = await ensureAssignableUser(d.assigned_user_id, householdId);
    if (!canAssignUser) {
        sendError(res, 400, 'BAD_REQUEST', 'La tarea no se puede asignar a un usuario fuera del hogar.');
        return;
    }

    const { rows } = await pool.query(
        `INSERT INTO tasks (project_id, title, description, status, priority, created_by_user_id, assigned_user_id, due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
            req.params.projectId,
            d.title,
            d.description ?? null,
            d.status,
            d.priority,
            req.user!.id,
            d.assigned_user_id ?? null,
            d.due_date ?? null,
        ]
    );
    res.status(201).json(rows[0]);

    if (d.assigned_user_id && d.assigned_user_id !== req.user!.id) {
        void sendPushNotification(d.assigned_user_id, {
            title: 'Nueva tarea asignada',
            body: `${req.user!.name} te ha asignado: ${d.title}`,
            url: `/projects/${req.params.projectId}`,
        });
    }
});

router.patch('/tasks/:id', async (req: AuthRequest, res: Response) => {
    const parsed = TaskSchema.partial().safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Los datos de la tarea no son validos.', parsed.error.flatten());
        return;
    }

    const householdId = req.user!.householdId || '';
    const existingTask = await findTaskForHousehold(req.params.id, householdId);
    if (!existingTask) {
        sendError(res, 404, 'NOT_FOUND', 'Tarea no encontrada.');
        return;
    }

    const d = parsed.data;
    const nextAssignedUserId = Object.prototype.hasOwnProperty.call(d, 'assigned_user_id')
        ? d.assigned_user_id ?? null
        : existingTask.assigned_user_id;

    const canAssignUser = await ensureAssignableUser(nextAssignedUserId, householdId);
    if (!canAssignUser) {
        sendError(res, 400, 'BAD_REQUEST', 'La tarea no se puede asignar a un usuario fuera del hogar.');
        return;
    }

    const updateColumns: string[] = [];
    const values: unknown[] = [];

    const pushField = (column: string, value: unknown) => {
        values.push(value);
        updateColumns.push(`${column} = $${values.length}`);
    };

    if (Object.prototype.hasOwnProperty.call(d, 'title')) pushField('title', d.title);
    if (Object.prototype.hasOwnProperty.call(d, 'description')) pushField('description', d.description ?? null);
    if (Object.prototype.hasOwnProperty.call(d, 'status')) pushField('status', d.status);
    if (Object.prototype.hasOwnProperty.call(d, 'priority')) pushField('priority', d.priority);
    if (Object.prototype.hasOwnProperty.call(d, 'assigned_user_id')) pushField('assigned_user_id', d.assigned_user_id ?? null);
    if (Object.prototype.hasOwnProperty.call(d, 'due_date')) pushField('due_date', d.due_date ?? null);
    pushField('updated_at', new Date());
    values.push(req.params.id, householdId);

    const { rows } = await pool.query(
        `UPDATE tasks t
         SET ${updateColumns.join(', ')}
         FROM projects p
         WHERE t.project_id = p.id
           AND t.id = $${values.length - 1}
           AND p.household_id = $${values.length}
         RETURNING t.*`,
        values
    );
    const task = rows[0];
    res.json(task);

    if (nextAssignedUserId && nextAssignedUserId !== req.user!.id) {
        void sendPushNotification(nextAssignedUserId, {
            title: 'Tarea actualizada/asignada',
            body: `${req.user!.name} te ha asignado o actualizado: ${task.title}`,
            url: '/projects',
        });
    }
});

router.delete('/tasks/:id', async (req: AuthRequest, res: Response) => {
    const result = await pool.query(
        `DELETE FROM tasks t
         USING projects p
         WHERE t.project_id = p.id
           AND t.id = $1
           AND p.household_id = $2`,
        [req.params.id, req.user!.householdId]
    );

    if (result.rowCount === 0) {
        sendError(res, 404, 'NOT_FOUND', 'Tarea no encontrada.');
        return;
    }

    res.json({ ok: true });
});

export default router;
