import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/index';
import pool from '../src/db/pool';

let adminUserId: string;
let memberUserId: string;
let householdId: string;
let shoppingListId: string;
let recipeId: string;

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

    await pool.query(
        `INSERT INTO memberships (user_id, household_id, role)
         VALUES ($1, $2, 'admin'), ($3, $2, 'member')`,
        [adminUserId, householdId, memberUserId]
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
}

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
    });

    it('POST /api/auth/register - rejects non-admin user creation', async () => {
        const memberLogin = await request(app).post('/api/auth/login').send({
            username: 'Buba', password: 'password123',
        });
        const res = await request(app).post('/api/auth/register').send({
            name: 'Blocked User', username: `blocked_${Date.now()}`, password: 'password123',
        }).set('Authorization', `Bearer ${memberLogin.body.token}`);
        expect(res.status).toBe(403);
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

afterAll(async () => { await pool.end(); });
