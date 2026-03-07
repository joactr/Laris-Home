import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import pool from '../src/db/pool';

describe('Auth endpoints', () => {
    let token: string;
    const testEmail = `test_${Date.now()}@home.hub`;

    it('POST /api/auth/register - creates user', async () => {
        const res = await request(app).post('/api/auth/register').send({
            name: 'Test User', email: testEmail, password: 'password123',
        });
        expect(res.status).toBe(201);
        expect(res.body.user).toHaveProperty('id');
        expect(res.body.user.email).toBe(testEmail);
    });

    it('POST /api/auth/login - returns JWT', async () => {
        const res = await request(app).post('/api/auth/login').send({
            email: 'alice@home.hub', password: 'password123',
        });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        token = res.body.token;
    });

    it('GET /api/auth/me - returns user info', async () => {
        const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('name', 'Alice');
    });

    it('POST /api/auth/login - rejects wrong password', async () => {
        const res = await request(app).post('/api/auth/login').send({
            email: 'alice@home.hub', password: 'wrongpassword',
        });
        expect(res.status).toBe(401);
    });
});

describe('Shopping list endpoints', () => {
    let token: string;
    let listId: string;
    let itemId: string;

    beforeAll(async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'alice@home.hub', password: 'password123' });
        token = res.body.token;
        const lists = await request(app).get('/api/shopping/lists').set('Authorization', `Bearer ${token}`);
        listId = lists.body[0].id;
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

describe('Chore endpoints', () => {
    let token: string;
    let instanceId: string;

    beforeAll(async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'alice@home.hub', password: 'password123' });
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
