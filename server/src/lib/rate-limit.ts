import type { NextFunction, Request, Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { sendError } from './api-error';

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  keyPrefix: string;
  windowMs: number;
  max: number;
  message: string;
};

const buckets = new Map<string, Bucket>();

export function resetRateLimitBuckets() {
  buckets.clear();
}

function getClientKey(req: Request) {
  const authReq = req as AuthRequest;
  return authReq.user?.id || req.ip || req.socket.remoteAddress || 'unknown';
}

function getBucket(key: string, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    const next = { count: 0, resetAt: now + windowMs };
    buckets.set(key, next);
    return next;
  }

  return current;
}

export function createRateLimiter(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${options.keyPrefix}:${getClientKey(req)}`;
    const bucket = getBucket(key, options.windowMs);
    bucket.count += 1;

    const remaining = Math.max(0, options.max - bucket.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000));

    res.setHeader('X-RateLimit-Limit', String(options.max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.max) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      sendError(
        res,
        429,
        'RATE_LIMITED',
        options.message,
        { retryAfterSeconds }
      );
      return;
    }

    next();
  };
}
