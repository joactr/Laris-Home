import type { NextFunction, Response } from 'express';
import pool from '../db/pool';
import type { AuthRequest } from '../middleware/auth';
import { sendError } from './api-error';

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const userId = req.user?.id;
  if (!userId) {
    sendError(res, 401, 'UNAUTHORIZED', 'Unauthorized.');
    return;
  }

  const { rows } = await pool.query(
    `SELECT 1 FROM memberships
     WHERE user_id = $1 AND household_id = $2 AND role = 'admin'`,
    [userId, req.user?.householdId]
  );
  if (!rows.length) {
    sendError(res, 403, 'FORBIDDEN', 'Only admins can perform this action.');
    return;
  }

  next();
}
