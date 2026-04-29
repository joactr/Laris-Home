import { createHash } from 'crypto';
import { Router, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { DailySummaryInput, OpenRouterService } from '../services/openrouter.service';

const router = Router();
router.use(authMiddleware);

const DASHBOARD_CACHE_TTL_MS = Number(process.env.DASHBOARD_CACHE_TTL_MS || '30000');

type DashboardSummaryResponse = {
  text: string;
  mode: 'ai' | 'fallback';
  status: 'ready' | 'pending';
  generated_at?: number | null;
};

type DashboardData = {
  today: string;
  attentionItems: Array<{ id: string; type: string; title: string; hint: string; path: string; tone: string }>;
  activity: Array<{ id: string; type: string; title: string; detail: string; path: string }>;
  stats: {
    events: number;
    chores: number;
    overdueTasks: number;
    shoppingPending: number;
  };
  events: any[];
  meals: Record<string, string> | null;
  chores: any[];
  overdueTasks: any[];
};

type DashboardSnapshot = {
  today: string;
  dashboard: DashboardData;
  summaryInput: DailySummaryInput;
};

type DashboardSnapshotCacheEntry = {
  expiresAt: number;
  value: DashboardSnapshot;
};

type SummaryCacheEntry = {
  signature: string;
  text: string | null;
  status: 'ready' | 'pending';
  generatedAt: number | null;
};

const dashboardSnapshotCache = new Map<string, DashboardSnapshotCacheEntry>();
const summaryCache = new Map<string, SummaryCacheEntry>();
const inFlightGenerations = new Set<string>();

router.get('/', async (req: AuthRequest, res: Response) => {
  const snapshot = await getDashboardSnapshot(req.user!.householdId!);
  void ensureSummaryGeneration(req.user!.householdId!, snapshot.today, snapshot.summaryInput);

  res.json({
    today: snapshot.dashboard.today,
    stats: snapshot.dashboard.stats,
    attention_items: snapshot.dashboard.attentionItems,
    activity: snapshot.dashboard.activity,
    events: snapshot.dashboard.events,
    meals: snapshot.dashboard.meals,
    chores: snapshot.dashboard.chores,
    overdue_tasks: snapshot.dashboard.overdueTasks,
  });
});

router.get('/summary', async (req: AuthRequest, res: Response) => {
  const snapshot = await getDashboardSnapshot(req.user!.householdId!);
  const summary = getSummarySnapshot(req.user!.householdId!, snapshot.today, snapshot.summaryInput);
  res.json(summary);
});

async function getDashboardSnapshot(householdId: string): Promise<DashboardSnapshot> {
  const today = new Date().toISOString().split('T')[0];
  const cacheKey = `${householdId}:${today}`;
  const now = Date.now();
  const cached = dashboardSnapshotCache.get(cacheKey);

  for (const [key, entry] of dashboardSnapshotCache.entries()) {
    if (entry.expiresAt <= now) {
      dashboardSnapshotCache.delete(key);
    }
  }

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const snapshot = await buildDashboardSnapshot(householdId, today);
  dashboardSnapshotCache.set(cacheKey, {
    value: snapshot,
    expiresAt: now + DASHBOARD_CACHE_TTL_MS,
  });
  return snapshot;
}

async function buildDashboardSnapshot(householdId: string, todayStr: string): Promise<DashboardSnapshot> {
  const today = new Date(`${todayStr}T12:00:00`);
  const todayLabel = today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const upcomingEnd = new Date(today);
  upcomingEnd.setDate(upcomingEnd.getDate() + 3);
  const upcomingEndStr = upcomingEnd.toISOString().split('T')[0];

  const [
    events,
    meals,
    chores,
    overdueTasks,
    shoppingPending,
    upcomingEvents,
    recentShopping,
  ] = await Promise.all([
    pool.query(
      `SELECT e.*, u.name AS assigned_name, u.color AS assigned_color
       FROM events e
       LEFT JOIN users u ON e.assigned_user_id = u.id
       WHERE e.household_id=$1 AND DATE(e.start_datetime)=$2
       ORDER BY e.start_datetime`,
      [householdId, todayStr]
    ),
    pool.query(
      `SELECT mpi.meal_type, mpi.text_content, r.title AS recipe_title
       FROM meal_plan_items mpi
       LEFT JOIN recipes r ON mpi.recipe_id = r.id
       WHERE mpi.household_id=$1 AND mpi.date=$2
       ORDER BY mpi.meal_type`,
      [householdId, todayStr]
    ),
    pool.query(
      `SELECT ci.*, ct.title, ct.location, ct.points, u.name AS assigned_name, u.color AS assigned_color
       FROM chore_instances ci
       JOIN chore_templates ct ON ci.template_id=ct.id
       LEFT JOIN users u ON ci.assigned_user_id=u.id
       WHERE ct.household_id=$1 AND ci.scheduled_date=$2
       ORDER BY ci.status, ct.title`,
      [householdId, todayStr]
    ),
    pool.query(
      `SELECT t.*, p.name AS project_name, u.name AS assigned_name
       FROM tasks t
       JOIN projects p ON t.project_id=p.id
       LEFT JOIN users u ON t.assigned_user_id=u.id
       WHERE p.household_id=$1 AND t.due_date < $2 AND t.status != 'done'
       ORDER BY t.due_date`,
      [householdId, todayStr]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS pending_count
       FROM list_items li
       JOIN shopping_lists sl ON li.list_id = sl.id
       WHERE sl.household_id = $1 AND li.is_completed = FALSE`,
      [householdId]
    ),
    pool.query(
      `SELECT e.title, e.start_datetime
       FROM events e
       WHERE e.household_id = $1 AND DATE(e.start_datetime) >= $2 AND DATE(e.start_datetime) <= $3
       ORDER BY e.start_datetime
       LIMIT 5`,
      [householdId, todayStr, upcomingEndStr]
    ),
    pool.query(
      `SELECT li.name, li.quantity, li.unit, sl.name AS list_name, li.created_at
       FROM list_items li
       JOIN shopping_lists sl ON li.list_id = sl.id
       WHERE sl.household_id = $1 AND li.is_completed = FALSE
       ORDER BY li.created_at DESC
       LIMIT 6`,
      [householdId]
    ),
  ]);

  const mealsObj: Record<string, string> = {};
  const mealDetails: Array<{ mealType: string; value: string }> = [];
  for (const row of meals.rows) {
    const text = row.recipe_title || row.text_content || 'Item';
    if (mealsObj[row.meal_type]) {
      mealsObj[row.meal_type] += `, ${text}`;
    } else {
      mealsObj[row.meal_type] = text;
    }
  }

  for (const [mealType, value] of Object.entries(mealsObj)) {
    mealDetails.push({ mealType: translateMealType(mealType), value });
  }

  const attentionItems = [
    ...overdueTasks.rows.slice(0, 3).map((task) => ({
      id: `task-${task.id}`,
      type: 'project',
      title: task.title,
      hint: `Atrasada en ${task.project_name}`,
      path: '/projects',
      tone: 'warning',
    })),
    ...chores.rows.filter((chore) => chore.status !== 'done').slice(0, 3).map((chore) => ({
      id: `chore-${chore.id}`,
      type: 'chore',
      title: chore.title,
      hint: chore.assigned_name ? `Pendiente · ${chore.assigned_name}` : 'Pendiente hoy',
      path: '/calendar',
      tone: 'info',
    })),
  ].slice(0, 6);

  const activity = [
    ...upcomingEvents.rows.map((event) => ({
      id: `event-${event.start_datetime}-${event.title}`,
      type: 'event',
      title: event.title,
      detail: new Date(event.start_datetime).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
      path: '/calendar',
    })),
    ...recentShopping.rows.map((item) => ({
      id: `shopping-${item.created_at}-${item.name}`,
      type: 'shopping',
      title: item.name,
      detail: `Pendiente en ${item.list_name}`,
      path: '/shopping',
    })),
  ].slice(0, 8);

  const summaryInput: DailySummaryInput = {
    dateLabel: todayLabel,
    events: events.rows.map((event) => ({
      title: event.title,
      time: new Date(event.start_datetime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      assignedTo: event.assigned_name,
    })),
    chores: chores.rows.map((chore) => ({
      title: chore.title,
      status: chore.status,
      assignedTo: chore.assigned_name,
    })),
    meals: Object.values(mealsObj),
    mealDetails,
    overdueTasks: overdueTasks.rows.slice(0, 4).map((task) => ({
      title: task.title,
      project: task.project_name,
    })),
    shoppingPendingCount: shoppingPending.rows[0]?.pending_count || 0,
    shoppingItems: recentShopping.rows.map((item) => ({
      name: item.name,
      listName: item.list_name,
      quantity: item.quantity == null ? null : Number(item.quantity),
      unit: item.unit,
    })),
    attentionItems: attentionItems.map((item) => ({
      title: item.title,
      hint: item.hint,
    })),
  };

  return {
    today: todayStr,
    dashboard: {
      today: todayStr,
      attentionItems,
      activity,
      stats: {
        events: events.rows.length,
        chores: chores.rows.length,
        overdueTasks: overdueTasks.rows.length,
        shoppingPending: shoppingPending.rows[0]?.pending_count || 0,
      },
      events: events.rows,
      meals: Object.keys(mealsObj).length > 0 ? mealsObj : null,
      chores: chores.rows,
      overdueTasks: overdueTasks.rows,
    },
    summaryInput,
  };
}

function ensureSummaryGeneration(householdId: string, today: string, input: DailySummaryInput) {
  const fallbackText = buildFallbackSummary(input);

  if (!OpenRouterService.isConfigured()) {
    return {
      text: fallbackText,
      mode: 'fallback' as const,
      status: 'ready' as const,
      generated_at: null,
    };
  }

  const key = `${householdId}:${today}`;
  const signature = createHash('sha1').update(JSON.stringify(input)).digest('hex');
  const cached = summaryCache.get(key);

  if (cached?.signature === signature) {
    return cached;
  }

  summaryCache.set(key, {
    signature,
    text: null,
    status: 'pending',
    generatedAt: null,
  });
  void generateSummaryInBackground(key, signature, input);

  return null;
}

function getSummarySnapshot(householdId: string, today: string, input: DailySummaryInput): DashboardSummaryResponse {
  const fallbackText = buildFallbackSummary(input);

  if (!OpenRouterService.isConfigured()) {
    return {
      text: fallbackText,
      mode: 'fallback',
      status: 'ready',
      generated_at: null,
    };
  }

  const key = `${householdId}:${today}`;
  const signature = createHash('sha1').update(JSON.stringify(input)).digest('hex');
  const cached = summaryCache.get(key);

  if (!cached || cached.signature !== signature) {
    ensureSummaryGeneration(householdId, today, input);
    return {
      text: fallbackText,
      mode: 'fallback',
      status: 'pending',
      generated_at: null,
    };
  }

  return {
    text: cached.text || fallbackText,
    mode: cached.text ? 'ai' : 'fallback',
    status: cached.status,
    generated_at: cached.generatedAt,
  };
}

async function generateSummaryInBackground(cacheKey: string, signature: string, input: DailySummaryInput) {
  const generationKey = `${cacheKey}:${signature}`;
  if (inFlightGenerations.has(generationKey)) {
    return;
  }

  inFlightGenerations.add(generationKey);

  try {
    const summaryText = await OpenRouterService.generateDailySummary(input);
    const current = summaryCache.get(cacheKey);
    if (!current || current.signature !== signature) {
      return;
    }

    summaryCache.set(cacheKey, {
      signature,
      text: summaryText || buildFallbackSummary(input),
      status: 'ready',
      generatedAt: Date.now(),
    });
  } catch (error) {
    console.error('Dashboard summary generation failed:', error);
    const current = summaryCache.get(cacheKey);
    if (current?.signature === signature) {
      summaryCache.set(cacheKey, {
        signature,
        text: null,
        status: 'ready',
        generatedAt: current.generatedAt,
      });
    }
  } finally {
    inFlightGenerations.delete(generationKey);
  }
}

function buildFallbackSummary(input: DailySummaryInput) {
  const fragments: string[] = [];

  if (input.events.length) {
    const eventPreview = input.events
      .slice(0, 2)
      .map((event) => `${event.time} ${event.title}`)
      .join(' y ');
    fragments.push(`Hoy tienes ${input.events.length} evento${input.events.length === 1 ? '' : 's'}: ${eventPreview}`);
  }

  const pendingChores = input.chores.filter((chore) => chore.status !== 'done');
  if (pendingChores.length) {
    const chorePreview = pendingChores
      .slice(0, 2)
      .map((chore) => chore.title)
      .join(' y ');
    fragments.push(`siguen pendientes ${chorePreview}`);
  }

  if (input.mealDetails.length) {
    const mealsPreview = input.mealDetails
      .slice(0, 2)
      .map((meal) => `${meal.mealType.toLowerCase()} ${meal.value}`)
      .join(' y ');
    fragments.push(`ya tienes previsto ${mealsPreview}`);
  }

  if (input.shoppingPendingCount) {
    const shoppingPreview = input.shoppingItems
      .slice(0, 3)
      .map((item) => item.name)
      .join(', ');
    fragments.push(
      shoppingPreview
        ? `quedan ${input.shoppingPendingCount} artículos por comprar, entre ellos ${shoppingPreview}`
        : `quedan ${input.shoppingPendingCount} artículos por comprar`
    );
  }

  if (input.overdueTasks.length) {
    const overduePreview = input.overdueTasks
      .slice(0, 2)
      .map((task) => `${task.title} (${task.project})`)
      .join(' y ');
    fragments.push(`hay tareas atrasadas como ${overduePreview}`);
  }

  if (!fragments.length) {
    return 'Hoy está bastante despejado. Puedes aprovechar para planificar comidas, revisar la compra o adelantar alguna tarea de casa.';
  }

  const [first, ...rest] = fragments;
  return `${capitalize(first)}${rest.length ? `; además ${rest.join('. ')}` : ''}.`;
}

function translateMealType(value: string) {
  switch (value) {
    case 'breakfast':
      return 'Desayuno';
    case 'lunch':
      return 'Comida';
    case 'dinner':
      return 'Cena';
    case 'snack':
      return 'Snack';
    default:
      return value;
  }
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default router;
