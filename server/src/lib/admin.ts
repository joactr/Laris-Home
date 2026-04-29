import type { NextFunction, Response } from 'express';
import pool from '../db/pool';
import type { AuthRequest } from '../middleware/auth';
import { sendError } from './api-error';

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const userId = req.user?.id;
  if (!userId) {
    sendError(res, 401, 'UNAUTHORIZED', 'No autorizado.');
    return;
  }

  const { rows } = await pool.query('SELECT is_admin FROM users WHERE id=$1', [userId]);
  if (!rows.length || !rows[0].is_admin) {
    sendError(res, 403, 'FORBIDDEN', 'Solo los administradores pueden realizar esta accion.');
    return;
  }

  next();
}
