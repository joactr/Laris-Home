import { Router, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// Dashboard: today's overview
router.get('/', async (req: AuthRequest, res: Response) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const hh = req.user!.householdId;

    const [events, meals, chores, overdueTasks] = await Promise.all([
        // Today's events
        pool.query(
            `SELECT e.*, u.name AS assigned_name, u.color AS assigned_color
       FROM events e LEFT JOIN users u ON e.assigned_user_id = u.id
       WHERE e.household_id=$1 AND DATE(e.start_datetime)=$2 ORDER BY e.start_datetime`,
            [hh, todayStr]
        ),
        // Today's meals
        pool.query(
            `SELECT mpi.meal_type, mpi.text_content, r.title as recipe_title
             FROM meal_plan_items mpi
             LEFT JOIN recipes r ON mpi.recipe_id = r.id
             WHERE mpi.household_id=$1 AND mpi.date=$2
             ORDER BY mpi.meal_type`,
            [hh, todayStr]
        ),
        // Today's chores
        pool.query(
            `SELECT ci.*, ct.title, ct.location, ct.points, u.name AS assigned_name, u.color AS assigned_color
       FROM chore_instances ci JOIN chore_templates ct ON ci.template_id=ct.id
       LEFT JOIN users u ON ci.assigned_user_id=u.id
       WHERE ct.household_id=$1 AND ci.scheduled_date=$2 ORDER BY ci.status, ct.title`,
            [hh, todayStr]
        ),
        // Overdue tasks
        pool.query(
            `SELECT t.*, p.name AS project_name, u.name AS assigned_name
       FROM tasks t JOIN projects p ON t.project_id=p.id
       LEFT JOIN users u ON t.assigned_user_id=u.id
       WHERE p.household_id=$1 AND t.due_date < $2 AND t.status != 'done'
       ORDER BY t.due_date`,
            [hh, todayStr]
        ),
    ]);

    const mealsObj: Record<string, string> = {};
    for (const row of meals.rows) {
        const text = row.recipe_title || row.text_content || 'Item';
        if (mealsObj[row.meal_type]) {
            mealsObj[row.meal_type] += `, ${text}`;
        } else {
            mealsObj[row.meal_type] = text;
        }
    }

    res.json({
        today: todayStr,
        events: events.rows,
        meals: Object.keys(mealsObj).length > 0 ? mealsObj : null,
        chores: chores.rows,
        overdue_tasks: overdueTasks.rows,
    });
});

export default router;
