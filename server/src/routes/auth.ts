import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../lib/admin';
import { sendError } from '../lib/api-error';
import { AUTH_TOKEN_TTL, getJwtSecret } from '../lib/jwt';
import { createRateLimiter } from '../lib/rate-limit';
import { createSafeRouter } from '../lib/router';

const router = createSafeRouter();

const loginRateLimiter = createRateLimiter({
    keyPrefix: 'auth-login',
    windowMs: 60_000,
    max: 10,
    message: 'Too many login attempts. Try again in a minute.',
});

const bootstrapRateLimiter = createRateLimiter({
    keyPrefix: 'auth-bootstrap',
    windowMs: 60_000,
    max: 5,
    message: 'Too many setup attempts. Try again in a minute.',
});

const RegisterSchema = z.object({
    name: z.string().trim().min(1).max(80),
    username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Invalid username.'),
    password: z.string().min(8).max(200),
});

const LoginSchema = z.object({
    username: z.string().trim().min(1),
    password: z.string().min(1),
});

const PasswordSchema = z.object({
    password: z.string().min(8).max(200),
});

router.param('id', (req, res, next, id) => {
    if (z.string().uuid().safeParse(id).success) {
        next();
        return;
    }
    sendError(res, 404, 'NOT_FOUND', 'User not found.');
});

router.post('/register', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response) => {
    const householdId = req.user?.householdId;
    if (!householdId) {
        sendError(res, 400, 'BAD_REQUEST', 'Missing user household.');
        return;
    }

    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'User data is not valid.', parsed.error.flatten());
        return;
    }
    const { name, username, password } = parsed.data;
    const hash = await bcrypt.hash(password, 10);
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const result = await client.query(
                'INSERT INTO users (name, username, password_hash) VALUES ($1,$2,$3) RETURNING id, name, username, is_admin, color',
                [name, username, hash]
            );
            const createdUser = result.rows[0];

            await client.query(
                `INSERT INTO memberships (user_id, household_id, role)
                 VALUES ($1, $2, 'member')`,
                [createdUser.id, householdId]
            );

            await client.query('COMMIT');
            res.status(201).json({ user: { ...createdUser, householdId } });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (err: any) {
        if (err.code === '23505') {
            sendError(res, 409, 'CONFLICT', 'That username already exists.');
            return;
        }
        throw err;
    }
});

router.get('/users', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(
        `SELECT u.id, u.name, u.username, u.color, m.role
         FROM users u
         JOIN memberships m ON m.user_id = u.id
         WHERE m.household_id = $1
         ORDER BY u.name ASC`,
        [req.user!.householdId]
    );
    res.json(rows);
});

router.put('/users/:id/password', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response) => {
    const parsed = PasswordSchema.safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Password must be at least 8 characters.');
        return;
    }

    const hash = await bcrypt.hash(parsed.data.password, 10);
    const { rowCount } = await pool.query(
        `UPDATE users u SET password_hash = $1
         FROM memberships m
         WHERE u.id = $2 AND m.user_id = u.id AND m.household_id = $3`,
        [hash, req.params.id, req.user!.householdId]
    );
    if (rowCount === 0) {
        sendError(res, 404, 'NOT_FOUND', 'User not found.');
        return;
    }
    res.json({ success: true });
});

router.post('/login', loginRateLimiter, async (req: Request, res: Response) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Invalid credentials.', parsed.error.flatten());
        return;
    }
    const { username, password } = parsed.data;
    const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (!rows.length) {
        sendError(res, 401, 'UNAUTHORIZED', 'Invalid credentials.');
        return;
    }
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        sendError(res, 401, 'UNAUTHORIZED', 'Invalid credentials.');
        return;
    }

    const membership = await pool.query(
        'SELECT household_id, role FROM memberships WHERE user_id=$1 LIMIT 1', [user.id]
    );
    const householdId = membership.rows[0]?.household_id ?? null;
    const isAdmin = membership.rows[0]?.role === 'admin';

    const token = jwt.sign(
        { id: user.id, username: user.username, name: user.name, color: user.color, householdId },
        getJwtSecret(),
        { expiresIn: AUTH_TOKEN_TTL }
    );
    res.json({ token, user: { id: user.id, name: user.name, username: user.username, is_admin: isAdmin, role: membership.rows[0]?.role ?? null, color: user.color, householdId } });
});

router.post('/register-first-admin', bootstrapRateLimiter, async (req: Request, res: Response) => {
    const { rows: existingUsers } = await pool.query('SELECT 1 FROM users LIMIT 1');
    if (existingUsers.length > 0) {
        sendError(res, 403, 'FORBIDDEN', 'Initial admin bootstrap is no longer available.');
        return;
    }

    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'User data is not valid.', parsed.error.flatten());
        return;
    }
    const { name, username, password } = parsed.data;
    const hash = await bcrypt.hash(password, 10);

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query("SELECT pg_advisory_xact_lock(hashtext('laris:bootstrap-admin'))");
            const lockedCheck = await client.query('SELECT 1 FROM users LIMIT 1');
            if (lockedCheck.rows.length > 0) {
                await client.query('ROLLBACK');
                sendError(res, 403, 'FORBIDDEN', 'Initial admin bootstrap is no longer available.');
                return;
            }
            const userResult = await client.query(
                'INSERT INTO users (name, username, password_hash, is_admin) VALUES ($1,$2,$3,$4) RETURNING id, name, username, is_admin, color',
                [name, username, hash, true]
            );
            const createdUser = userResult.rows[0];
            const householdResult = await client.query(
                'INSERT INTO households (name) VALUES ($1) RETURNING id',
                [`Household of ${name}`]
            );
            const householdId = householdResult.rows[0].id;
            await client.query(
                `INSERT INTO memberships (user_id, household_id, role)
                 VALUES ($1, $2, 'admin')`,
                [createdUser.id, householdId]
            );
            await client.query('COMMIT');
            res.status(201).json({ user: { ...createdUser, householdId } });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (err: any) {
        if (err.code === '23505') {
            sendError(res, 409, 'CONFLICT', 'That username already exists.');
            return;
        }
        throw err;
    }
});

router.get('/bootstrap-status', async (_req: Request, res: Response) => {
    const { rows } = await pool.query('SELECT 1 FROM users LIMIT 1');
    res.json({ needsBootstrap: rows.length === 0 });
});

router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query('SELECT id, name, username, is_admin, color FROM users WHERE id=$1', [req.user!.id]);
    if (!rows.length) {
        sendError(res, 404, 'NOT_FOUND', 'User not found.');
        return;
    }
    const membership = await pool.query(
        'SELECT household_id, role FROM memberships WHERE user_id=$1 LIMIT 1', [req.user!.id]
    );
    const householdId = membership.rows[0]?.household_id ?? null;
    res.json({ ...rows[0], is_admin: membership.rows[0]?.role === 'admin', role: membership.rows[0]?.role ?? null, householdId });
});

router.get('/household/members', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(
        `SELECT u.id, u.name, u.username, u.color, m.role
     FROM users u JOIN memberships m ON u.id = m.user_id
     WHERE m.household_id = $1`,
        [req.user!.householdId]
    );
    res.json(rows);
});

export default router;
