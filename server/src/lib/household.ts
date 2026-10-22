import type { NextFunction, Response } from 'express';
import pool from '../db/pool';
import type { AuthRequest } from '../middleware/auth';
import { sendError } from './api-error';

export function requireHousehold(req: AuthRequest, res: Response, next: NextFunction) {
    if (!req.user?.householdId) {
        sendError(res, 403, 'UNAUTHORIZED', 'User does not belong to a household.');
        return;
    }
    next();
}

export async function isHouseholdMember(userId: string, householdId: string) {
    const { rows } = await pool.query(
        'SELECT 1 FROM memberships WHERE user_id = $1 AND household_id = $2',
        [userId, householdId]
    );
    return rows.length > 0;
}