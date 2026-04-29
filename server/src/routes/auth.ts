import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../lib/admin';
import { sendError } from '../lib/api-error';
import { AUTH_TOKEN_TTL, getJwtSecret } from '../lib/jwt';

const router = Router();

const RegisterSchema = z.object({
    name: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(6),
});

const LoginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});

router.post('/register', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response) => {
    const householdId = req.user?.householdId;
    if (!householdId) {
        sendError(res, 400, 'BAD_REQUEST', 'Falta el household del usuario.');
        return;
    }

    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Los datos del usuario no son validos.', parsed.error.flatten());
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
            sendError(res, 409, 'CONFLICT', 'Ese nombre de usuario ya existe.');
            return;
        }
        throw err;
    }
});

router.get('/users', authMiddleware, requireAdmin, async (_req: AuthRequest, res: Response) => {
    const { rows } = await pool.query('SELECT id, name, username, is_admin, color FROM users ORDER BY name ASC');
    res.json(rows);
});

router.put('/users/:id/password', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
        sendError(res, 400, 'VALIDATION_ERROR', 'La contrasena debe tener al menos 6 caracteres.');
        return;
    }

    const hash = await bcrypt.hash(password, 10);
    const { rowCount } = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);
    if (rowCount === 0) {
        sendError(res, 404, 'NOT_FOUND', 'Usuario no encontrado.');
        return;
    }
    res.json({ success: true });
});

router.post('/login', async (req: Request, res: Response) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Credenciales no validas.', parsed.error.flatten());
        return;
    }
    const { username, password } = parsed.data;
    const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (!rows.length) {
        sendError(res, 401, 'UNAUTHORIZED', 'Credenciales invalidas.');
        return;
    }
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        sendError(res, 401, 'UNAUTHORIZED', 'Credenciales invalidas.');
        return;
    }

    const membership = await pool.query(
        'SELECT household_id FROM memberships WHERE user_id=$1 LIMIT 1', [user.id]
    );
    const householdId = membership.rows[0]?.household_id ?? null;

    const token = jwt.sign(
        { id: user.id, username: user.username, name: user.name, color: user.color, householdId },
        getJwtSecret(),
        { expiresIn: AUTH_TOKEN_TTL }
    );
    res.json({ token, user: { id: user.id, name: user.name, username: user.username, is_admin: user.is_admin, color: user.color, householdId } });
});

router.post('/register-first-admin', async (req: Request, res: Response) => {
    const { rows: existingUsers } = await pool.query('SELECT 1 FROM users LIMIT 1');
    if (existingUsers.length > 0) {
        sendError(res, 403, 'FORBIDDEN', 'El bootstrap inicial de admin ya no esta disponible.');
        return;
    }

    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Los datos del usuario no son validos.', parsed.error.flatten());
        return;
    }
    const { name, username, password } = parsed.data;
    const hash = await bcrypt.hash(password, 10);

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const userResult = await client.query(
                'INSERT INTO users (name, username, password_hash, is_admin) VALUES ($1,$2,$3,$4) RETURNING id, name, username, is_admin, color',
                [name, username, hash, true]
            );
            const createdUser = userResult.rows[0];
            const householdResult = await client.query(
                'INSERT INTO households (name) VALUES ($1) RETURNING id',
                [`Hogar de ${name}`]
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
            sendError(res, 409, 'CONFLICT', 'Ese nombre de usuario ya existe.');
            return;
        }
        throw err;
    }
});

router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query('SELECT id, name, username, is_admin, color FROM users WHERE id=$1', [req.user!.id]);
    if (!rows.length) {
        sendError(res, 404, 'NOT_FOUND', 'Usuario no encontrado.');
        return;
    }
    const membership = await pool.query(
        'SELECT household_id FROM memberships WHERE user_id=$1 LIMIT 1', [req.user!.id]
    );
    const householdId = membership.rows[0]?.household_id ?? null;
    res.json({ ...rows[0], householdId });
});

router.get('/household/members', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(
        `SELECT u.id, u.name, u.username, u.is_admin, u.color, m.role
     FROM users u JOIN memberships m ON u.id = m.user_id
     WHERE m.household_id = $1`,
        [req.user!.householdId]
    );
    res.json(rows);
});

export default router;
