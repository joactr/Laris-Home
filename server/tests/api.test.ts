import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/index';
import pool from '../src/db/pool';
import { resetRateLimitBuckets } from '../src/lib/rate-limit';
import { RecipeService } from '../src/services/recipe.service';
import { OpenRouterService } from '../src/services/openrouter.service';

let adminUserId: string;
let memberUserId: string;
let householdId: string;
let shoppingListId: string;
let recipeId: string;
let outsiderUserId: string;
let outsiderHouseholdId: string;
let outsiderProjectId: string;
let outsiderTaskId: string;

async function resetTestData() {
    const passwordHash = await bcrypt.hash('password123', 10);

    await pool.query('TRUNCATE TABLE households CASCADE');
    await pool.query('TRUNCATE TABLE users CASCADE');

    const adminRes = await pool.query(
        `INSERT INTO users (name, username, password_hash, is_admin, color)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['JM', 'JM', passwordHash, true, '#ec4899']
    );
    adminUserId = adminRes.rows[0].id;

    const memberRes = await pool.query(
        `INSERT INTO users (name, username, password_hash, is_admin, color)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['Buba', 'Buba', passwordHash, false, '#6366f1']
    );
    memberUserId = memberRes.rows[0].id;

    const householdRes = await pool.query(
        `INSERT INTO households (name) VALUES ($1) RETURNING id`,
        ['Test Home']
    );
    householdId = householdRes.rows[0].id;

    const outsiderHouseholdRes = await pool.query(
        `INSERT INTO households (name) VALUES ($1) RETURNING id`,
        ['Other Home']
    );
    outsiderHouseholdId = outsiderHouseholdRes.rows[0].id;

    const outsiderRes = await pool.query(
        `INSERT INTO users (name, username, password_hash, is_admin, color)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['Outsider', 'Outsider', passwordHash, false, '#14b8a6']
    );
    outsiderUserId = outsiderRes.rows[0].id;

    await pool.query(
        `INSERT INTO memberships (user_id, household_id, role)
         VALUES ($1, $2, 'admin'), ($3, $2, 'member'), ($4, $5, 'member')`,
        [adminUserId, householdId, memberUserId, outsiderUserId, outsiderHouseholdId]
    );

    const listRes = await pool.query(
        `INSERT INTO shopping_lists (household_id, name, is_default)
         VALUES ($1, 'Groceries', true)
         RETURNING id`,
        [householdId]
    );
    shoppingListId = listRes.rows[0].id;

    const recipeRes = await pool.query(
        `INSERT INTO recipes (household_id, title, description, instructions, servings)
         VALUES ($1, 'Pasta Test', 'desc', 'step 1', 2)
         RETURNING id`,
        [householdId]
    );
    recipeId = recipeRes.rows[0].id;

    await pool.query(
        `INSERT INTO recipe_ingredients (recipe_id, name, original_text, quantity, unit, notes)
         VALUES
         ($1, 'pasta', '200 g pasta', 200, 'g', NULL),
         ($1, 'tomate', '2 tomates', 2, 'unidad', 'maduros')`,
        [recipeId]
    );

    const outsiderProjectRes = await pool.query(
        `INSERT INTO projects (household_id, name, description, status)
         VALUES ($1, 'Other Project', 'private', 'active')
         RETURNING id`,
        [outsiderHouseholdId]
    );
    outsiderProjectId = outsiderProjectRes.rows[0].id;

    const outsiderTaskRes = await pool.query(
        `INSERT INTO tasks (project_id, title, status, priority, created_by_user_id)
         VALUES ($1, 'Private task', 'todo', 'medium', $2)
         RETURNING id`,
        [outsiderProjectId, outsiderUserId]
    );
    outsiderTaskId = outsiderTaskRes.rows[0].id;
}

beforeEach(() => {
    vi.unstubAllGlobals();
    resetRateLimitBuckets();
    vi.restoreAllMocks();
});

describe('Auth endpoints', () => {
    let token: string;
    const testUsername = `test_${Date.now()}`;

    beforeAll(async () => {
        await resetTestData();
        const loginRes = await request(app).post('/api/auth/login').send({
            username: 'JM', password: 'password123',
        });
        token = loginRes.body.token;
    });

    it('POST /api/auth/register - admin creates user', async () => {
        const res = await request(app).post('/api/auth/register').send({
            name: 'Test User', username: testUsername, password: 'password123',
        }).set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(201);
        expect(res.body.user).toHaveProperty('id');
        expect(res.body.user.username).toBe(testUsername);
    });

    it('POST /api/auth/login - returns JWT', async () => {
        const res = await request(app).post('/api/auth/login').send({
            username: 'JM', password: 'password123',
        });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        token = res.body.token;
    });

    it('GET /api/auth/me - returns user info', async () => {
        const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('name', 'JM');
    });

    it('POST /api/auth/login - rejects wrong password', async () => {
        const res = await request(app).post('/api/auth/login').send({
            username: 'JM', password: 'wrongpassword',
        });
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('POST /api/auth/register - rejects non-admin user creation', async () => {
        const memberLogin = await request(app).post('/api/auth/login').send({
            username: 'Buba', password: 'password123',
        });
        const res = await request(app).post('/api/auth/register').send({
            name: 'Blocked User', username: `blocked_${Date.now()}`, password: 'password123',
        }).set('Authorization', `Bearer ${memberLogin.body.token}`);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('GET /api/auth/me - rejects missing token with structured error', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
});

describe('Project task authorization', () => {
    let token: string;

    beforeAll(async () => {
        const res = await request(app).post('/api/auth/login').send({ username: 'JM', password: 'password123' });
        token = res.body.token;
    });

    it('POST /api/projects/:projectId/tasks blocks creating tasks in another household project', async () => {
        const res = await request(app)
            .post(`/api/projects/${outsiderProjectId}/tasks`)
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'Should fail' });

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('PATCH /api/projects/tasks/:id blocks editing tasks in another household', async () => {
        const res = await request(app)
            .patch(`/api/projects/tasks/${outsiderTaskId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ status: 'done' });

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('DELETE /api/projects/tasks/:id blocks deleting tasks in another household', async () => {
        const res = await request(app)
            .delete(`/api/projects/tasks/${outsiderTaskId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('POST /api/projects/:projectId/tasks blocks assigning tasks to users outside the household', async () => {
        const projectRes = await pool.query(
            `INSERT INTO projects (household_id, name, description, status)
             VALUES ($1, 'Shared Project', 'desc', 'active')
             RETURNING id`,
            [householdId]
        );

        const res = await request(app)
            .post(`/api/projects/${projectRes.rows[0].id}/tasks`)
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'Should fail', assigned_user_id: outsiderUserId });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('BAD_REQUEST');
    });
});

describe('Shopping list endpoints', () => {
    let token: string;
    let listId: string;
    let itemId: string;

    beforeAll(async () => {
        const res = await request(app).post('/api/auth/login').send({ username: 'JM', password: 'password123' });
        token = res.body.token;
        listId = shoppingListId;
    });

    it('POST /api/shopping/lists/:id/items - adds item', async () => {
        const res = await request(app)
            .post(`/api/shopping/lists/${listId}/items`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Test Butter', quantity: 200, unit: 'g', category: 'Dairy' });
        expect(res.status).toBe(201);
        expect(res.body.name).toBe('Test Butter');
        itemId = res.body.id;
    });

    it('PATCH /api/shopping/items/:id/complete - marks item complete', async () => {
        const res = await request(app)
            .patch(`/api/shopping/items/${itemId}/complete`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.is_completed).toBe(true);
        expect(res.body.completed_at).not.toBeNull();
    });

    it('POST /api/shopping/items/:id/readd - re-adds completed item', async () => {
        const res = await request(app)
            .post(`/api/shopping/items/${itemId}/readd`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.is_completed).toBe(false);
    });

    it('previews duplicates, normalizes units, and merges quantities', async () => {
        const first = await request(app)
            .post(`/api/shopping/lists/${listId}/items`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: '1kg arroz' });
        expect(first.status).toBe(201);
        expect(first.body.name).toBe('arroz');
        expect(Number(first.body.quantity)).toBe(1000);
        expect(first.body.unit).toBe('g');

        const preview = await request(app)
            .post(`/api/shopping/lists/${listId}/items/preview`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: '500 g arroz' });
        expect(preview.status).toBe(200);
        expect(preview.body.candidates[0].id).toBe(first.body.id);

        const merge = await request(app)
            .post(`/api/shopping/items/${first.body.id}/merge`)
            .set('Authorization', `Bearer ${token}`)
            .send({ source: { name: '500 g arroz' }, mode: 'merge' });
        expect(merge.status).toBe(200);
        expect(Number(merge.body.quantity)).toBe(1500);
        expect(merge.body.unit).toBe('g');
    });

    it('suggests completed items for buy again excluding active duplicates', async () => {
        const completed = await request(app)
            .post(`/api/shopping/lists/${listId}/items`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Yogur', allowDuplicate: true });
        await request(app)
            .patch(`/api/shopping/items/${completed.body.id}/complete`)
            .set('Authorization', `Bearer ${token}`);

        const suggestions = await request(app)
            .get(`/api/shopping/lists/${listId}/buy-again`)
            .set('Authorization', `Bearer ${token}`);
        expect(suggestions.status).toBe(200);
        expect(suggestions.body.some((item: any) => item.name === 'Yogur')).toBe(true);
    });

    it('DELETE /api/shopping/items/:id - deletes item', async () => {
        const res = await request(app)
            .delete(`/api/shopping/items/${itemId}`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });
});

describe('Meal planning endpoints', () => {
    let token: string;

    beforeAll(async () => {
        const res = await request(app).post('/api/auth/login').send({ username: 'JM', password: 'password123' });
        token = res.body.token;

        await pool.query(
            `INSERT INTO meal_plan_items (household_id, date, meal_type, recipe_id, servings)
             VALUES
             ($1, '2026-03-17', 'dinner', $2, 4),
             ($1, '2026-03-18', 'lunch', NULL, 1)`,
            [householdId, recipeId]
        );
    });

    it('POST /api/meals/generate-shopping - generates list items from recipe meals and skips text meals', async () => {
        const res = await request(app)
            .post('/api/meals/generate-shopping')
            .set('Authorization', `Bearer ${token}`)
            .send({
                start: '2026-03-17',
                end: '2026-03-23',
                listId: shoppingListId,
            });

        expect(res.status).toBe(200);
        expect(res.body.addedCount).toBe(2);
        expect(res.body.recipeMealCount).toBe(1);
        expect(res.body.skippedTextMealsCount).toBe(1);

        const itemsRes = await request(app)
            .get(`/api/shopping/lists/${shoppingListId}/items`)
            .set('Authorization', `Bearer ${token}`);

        expect(itemsRes.status).toBe(200);
        expect(itemsRes.body.some((item: any) => item.name === 'pasta' && Number(item.quantity) === 400)).toBe(true);
        expect(itemsRes.body.some((item: any) => item.name === 'tomate' && Number(item.quantity) === 4)).toBe(true);
    });
});

describe('Chore endpoints', () => {
    let token: string;
    let instanceId: string;

    beforeAll(async () => {
        const res = await request(app).post('/api/auth/login').send({ username: 'JM', password: 'password123' });
        token = res.body.token;
    });

    it('POST /api/chores/templates - creates template and generates instances', async () => {
        const res = await request(app)
            .post('/api/chores/templates')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'Test Chore', recurrence_type: 'daily', recurrence_days: [0, 1, 2, 3, 4, 5, 6], points: 2 });
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.title).toBe('Test Chore');
    });

    it('GET /api/chores/instances - returns instances for today', async () => {
        const today = new Date().toISOString().split('T')[0];
        const res = await request(app)
            .get(`/api/chores/instances?start=${today}&end=${today}`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        if (res.body.length > 0) instanceId = res.body[0].id;
    });

    it('PATCH /api/chores/instances/:id/status - marks chore done', async () => {
        if (!instanceId) return;
        const res = await request(app)
            .patch(`/api/chores/instances/${instanceId}/status`)
            .set('Authorization', `Bearer ${token}`)
            .send({ status: 'done' });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('done');
        expect(res.body.completed_at).not.toBeNull();
    });
});

describe('Rate limiting and recipe import', () => {
    let token: string;

    beforeAll(async () => {
        const res = await request(app).post('/api/auth/login').send({ username: 'JM', password: 'password123' });
        token = res.body.token;
    });

    it('POST /api/voice/shopping is rate limited', async () => {
        vi.spyOn(OpenRouterService, 'parseVoiceShopping').mockResolvedValue({
            items: [{ name: 'leche', quantity: 1 }],
            message: 'ok',
        });

        for (let attempt = 0; attempt < 20; attempt += 1) {
            const response = await request(app)
                .post('/api/voice/shopping')
                .set('Authorization', `Bearer ${token}`)
                .send({ transcript: `add milk ${attempt}` });
            expect(response.status).toBe(200);
        }

        const limited = await request(app)
            .post('/api/voice/shopping')
            .set('Authorization', `Bearer ${token}`)
            .send({ transcript: 'one more' });

        expect(limited.status).toBe(429);
        expect(limited.body.error.code).toBe('RATE_LIMITED');
    });

    it('POST /api/recipes/import-from-url is rate limited', async () => {
        vi.spyOn(RecipeService, 'fetchAndParse').mockResolvedValue({
            title: 'Mock recipe',
            description: 'desc',
            servings: 2,
            prepTimeMinutes: 10,
            cookTimeMinutes: 20,
            ingredients: [{ name: 'tomate', originalText: '2 tomates' }],
            instructions: ['mezclar'],
            imageUrl: null,
        });

        for (let attempt = 0; attempt < 6; attempt += 1) {
            const response = await request(app)
                .post('/api/recipes/import-from-url')
                .set('Authorization', `Bearer ${token}`)
                .send({ url: `https://example.com/recipe-${attempt}` });
            expect(response.status).toBe(200);
        }

        const limited = await request(app)
            .post('/api/recipes/import-from-url')
            .set('Authorization', `Bearer ${token}`)
            .send({ url: 'https://example.com/recipe-over-limit' });

        expect(limited.status).toBe(429);
        expect(limited.body.error.code).toBe('RATE_LIMITED');
    });

    it('stores shared recipe tags and per-user recipe preferences', async () => {
        const tags = await request(app)
            .put(`/api/recipes/${recipeId}/tags`)
            .set('Authorization', `Bearer ${token}`)
            .send({ tags: ['Cena', 'Rápida'] });
        expect(tags.status).toBe(200);
        expect(tags.body.map((tag: any) => tag.name)).toContain('Cena');

        const prefs = await request(app)
            .put(`/api/recipes/${recipeId}/preferences`)
            .set('Authorization', `Bearer ${token}`)
            .send({ isFavorite: true, rating: 5 });
        expect(prefs.status).toBe(200);
        expect(prefs.body.is_favorite).toBe(true);
        expect(prefs.body.my_rating).toBe(5);

        const filtered = await request(app)
            .get('/api/recipes?tags=Cena&favorite=true&minRating=5')
            .set('Authorization', `Bearer ${token}`);
        expect(filtered.status).toBe(200);
        expect(filtered.body.some((recipe: any) => recipe.id === recipeId)).toBe(true);
        expect(filtered.body.find((recipe: any) => recipe.id === recipeId).tags[0].name).toBe('Cena');
    });

    it('RecipeService.fetchAndParse prioritizes JSON-LD recipe data', async () => {
        const html = `
          <html>
            <head>
              <script type="application/ld+json">
                {
                  "@context": "https://schema.org",
                  "@type": "Recipe",
                  "name": "Tortilla",
                  "description": "Clasica",
                  "recipeYield": "4 servings",
                  "prepTime": "PT10M",
                  "cookTime": "PT15M",
                  "image": "/images/tortilla.jpg",
                  "recipeIngredient": ["4 huevos", "2 patatas"],
                  "recipeInstructions": [
                    { "@type": "HowToStep", "text": "Batir los huevos" },
                    { "@type": "HowToStep", "text": "Freir las patatas" }
                  ]
                }
              </script>
            </head>
            <body>ignored content</body>
          </html>
        `;

        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (url === 'https://example.com/tortilla') {
                return {
                    ok: true,
                    url,
                    text: async () => html,
                };
            }

            throw new Error('macro provider unavailable');
        }));

        const recipe = await RecipeService.fetchAndParse('https://example.com/tortilla');

        expect(recipe.title).toBe('Tortilla');
        expect(recipe.servings).toBe(4);
        expect(recipe.instructions).toEqual(['Batir los huevos', 'Freir las patatas']);
        expect(recipe.imageUrl).toBe('https://example.com/images/tortilla.jpg');
        expect(recipe.ingredients[0].originalText).toBe('4 huevos');
    });
});

afterAll(async () => { await pool.end(); });
