import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

const RegisterSchema = z.object({
    name: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(6),
});

const LoginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});

router.post('/register', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { rows: adminRows } = await pool.query('SELECT is_admin FROM users WHERE id=$1', [req.user!.id]);
    if (!adminRows.length || !adminRows[0].is_admin) {
        res.status(403).json({ error: 'Only admins can register new users' });
        return;
    }

    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const { name, username, password } = parsed.data;
    const hash = await bcrypt.hash(password, 10);
    try {
        const result = await pool.query(
            'INSERT INTO users (name, username, password_hash) VALUES ($1,$2,$3) RETURNING id, name, username, is_admin, color',
            [name, username, hash]
        );
        res.status(201).json({ user: result.rows[0] });
    } catch (err: any) {
        if (err.code === '23505') { res.status(409).json({ error: 'Username already registered' }); return; }
        throw err;
    }
});

router.get('/users', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { rows: adminRows } = await pool.query('SELECT is_admin FROM users WHERE id=$1', [req.user!.id]);
    if (!adminRows.length || !adminRows[0].is_admin) {
        res.status(403).json({ error: 'Only admins can view all users' });
        return;
    }
    const { rows } = await pool.query('SELECT id, name, username, is_admin, color FROM users ORDER BY name ASC');
    res.json(rows);
});

router.put('/users/:id/password', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { rows: adminRows } = await pool.query('SELECT is_admin FROM users WHERE id=$1', [req.user!.id]);
    if (!adminRows.length || !adminRows[0].is_admin) {
        res.status(403).json({ error: 'Only admins can change user passwords' });
        return;
    }

    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters' });
        return;
    }

    const hash = await bcrypt.hash(password, 10);
    const { rowCount } = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);
    if (rowCount === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    res.json({ success: true });
});

router.post('/login', async (req: Request, res: Response) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const { username, password } = parsed.data;
    const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (!rows.length) { res.status(401).json({ error: 'Invalid credentials' }); return; }
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) { res.status(401).json({ error: 'Invalid credentials' }); return; }

    const membership = await pool.query(
        'SELECT household_id FROM memberships WHERE user_id=$1 LIMIT 1', [user.id]
    );
    const householdId = membership.rows[0]?.household_id ?? null;

    const token = jwt.sign(
        { id: user.id, username: user.username, name: user.name, color: user.color, householdId },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, name: user.name, username: user.username, is_admin: user.is_admin, color: user.color, householdId } });
});

router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query('SELECT id, name, username, is_admin, color FROM users WHERE id=$1', [req.user!.id]);
    if (!rows.length) { res.status(404).json({ error: 'User not found' }); return; }
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
