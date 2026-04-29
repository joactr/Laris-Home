import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { sendError } from '../lib/api-error';
import { getJwtSecret, type AuthTokenPayload } from '../lib/jwt';

export interface AuthRequest extends Request {
    user?: AuthTokenPayload;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        sendError(res, 401, 'UNAUTHORIZED', 'Falta el token de autenticacion.');
        return;
    }
    const token = header.split(' ')[1];
    try {
        const payload = jwt.verify(token, getJwtSecret()) as unknown as AuthTokenPayload;
        req.user = payload;
        next();
    } catch {
        sendError(res, 401, 'UNAUTHORIZED', 'El token no es valido o ha expirado.');
    }
}
